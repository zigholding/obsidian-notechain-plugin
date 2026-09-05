import { App, Component, MarkdownRenderer } from 'obsidian';
import { readHttpBody } from './httpUtil';
import type { OnlineVaultMediaService } from './onlineVaultMedia';
import type { HttpReq, HttpRes } from '../http-types';
import { parseJsonRecord } from '../http-types';
import { noteChainPlugin, obsidianApp } from '../obsidian-app';
import { errorMessage } from '../ts-helpers';

export class OnlineMarkdownRenderService {
    /** Dataview 慢查询时可能长时间无 mutation 事件；过短会提前 done，浏览器只收到半截表格 */
    private static readonly ONLINE_DV_IDLE_MS = 4200;
    private static readonly ONLINE_DV_MAX_MS = 25000;
    private static readonly ONLINE_DV_BOOTSTRAP_MS = 5500;
    /** 轮询补漏：部分环境下 Dataview 大块替换未稳定触发 MutationObserver */
    private static readonly ONLINE_DV_POLL_MS = 400;

    /** 本页 dataview 与「嵌入内的 dataview」共用长等待（否则 embed 的 720ms 上限会截断） */
    private static isDataviewDwellProfile(profile: string): boolean {
        return profile === 'dataview' || profile === 'embed+dataview';
    }

    /** 正文中 ```dataview / dataviewjs 块数量（嵌入子笔记里的围栏不在父 markdown 中） */
    private static countDataviewFencesInMarkdown(md: string): number {
        if (!md) {
            return 0;
        }
        let m = md.match(/(^|\r?\n)```[\t ]*dataview(?:js)?\b/gim);
        return m ? m.length : 0;
    }

    /** 多块 Dataview 串行/错峰更新时，需更长静默与总上限 */
    private static scaledDataviewTiming(blockCount: number): { idleMs: number; maxMs: number } {
        let n = Math.floor(blockCount);
        if (n < 1) {
            n = 1;
        }
        if (n > 32) {
            n = 32;
        }
        let idleMs = Math.min(
            12000,
            OnlineMarkdownRenderService.ONLINE_DV_IDLE_MS + (n - 1) * 1400,
        );
        let maxMs = Math.min(
            120000,
            OnlineMarkdownRenderService.ONLINE_DV_MAX_MS + (n - 1) * 16000,
        );
        return { idleMs, maxMs };
    }

    constructor(
        private app: App,
        private vault: OnlineVaultMediaService,
    ) {}

    /**
     * 将 Markdown 渲染为 HTML 并以 NDJSON 流推送：首帧尽快返回，Dataview 等异步更新时防抖刷新，最后 done:true。
     * 每行一个 JSON：{ html, done? , error? }
     */
    private async streamOnlineRenderNdjson(
        res: HttpRes,
        el: HTMLElement,
        idleMs: number,
        maxMs: number,
        sourcePath: string,
        debugPath: string,
        debugSinceReqMs: number,
        streamProfile: string,
        dvFenceHint: number,
    ): Promise<void> {
        let lastSentRaw = '';
        let pushedFrames = 0;
        let mutationCount = 0;
        const tStream = Date.now();
        const writeLine = (html: string, done: boolean) => {
            if (res.writableEnded) {
                return;
            }
            if (!done && html === lastSentRaw) {
                return;
            }
            lastSentRaw = html;
            let htmlOut = this.vault.rewriteOnlinePreviewHtml(html, sourcePath);
            res.write(JSON.stringify({ html: htmlOut, done }) + '\n');
            pushedFrames++;
            if (typeof res.flush === 'function') {
                res.flush();
            }
        };

        writeLine(el.innerHTML, false);
        this.logOnlineRender('stream first frame', {
            path: debugPath,
            sinceReqMs: Date.now() - debugSinceReqMs,
            sinceStreamMs: Date.now() - tStream,
            htmlLen: el.innerHTML.length,
            dvBlocks: this.countDataviewBlocks(el),
            streamProfile,
            pushedFrames,
        });

        /** 嵌入内 Dataview 可能晚于首次 timing 才挂 DOM，需在流式阶段升格为长等 */
        const timing = { idleMs, maxMs, profile: streamProfile };
        let peakDvBlocks = Math.max(this.countDataviewBlocks(el), dvFenceHint);

        await new Promise<void>((resolve) => {
            let settled = false;
            let lastMutation = Date.now();
            let idleTimer: number | null = null;
            let debouncePushTimer: number | null = null;
            let dvPollTimer: number | null = null;
            let embedProbeTimer: number | null = null;
            let lastDvHtmlSnap = el.innerHTML;
            let pollChangeLogs = 0;
            let finishReason: 'idle' | 'max' | 'unknown' = 'unknown';
            let maxTimer: number | null = null;

            const applyDataviewTimingScale = () => {
                if (!OnlineMarkdownRenderService.isDataviewDwellProfile(timing.profile)) {
                    return;
                }
                let c = this.countDataviewBlocks(el);
                if (c > peakDvBlocks) {
                    peakDvBlocks = c;
                }
                let n = Math.max(1, peakDvBlocks);
                let s = OnlineMarkdownRenderService.scaledDataviewTiming(n);
                let bump = s.maxMs > timing.maxMs || s.idleMs > timing.idleMs;
                if (s.maxMs > timing.maxMs) {
                    timing.maxMs = s.maxMs;
                }
                if (s.idleMs > timing.idleMs) {
                    timing.idleMs = s.idleMs;
                }
                if (bump) {
                    armMaxTimer();
                    schedule();
                }
            };

            const armMaxTimer = () => {
                if (maxTimer !== null) {
                    window.clearTimeout(maxTimer);
                }
                maxTimer = window.setTimeout(() => finish('max'), timing.maxMs);
            };

            const startDvPollIfNeeded = () => {
                if (dvPollTimer || settled) {
                    return;
                }
                if (!OnlineMarkdownRenderService.isDataviewDwellProfile(timing.profile)) {
                    return;
                }
                lastDvHtmlSnap = el.innerHTML;
                dvPollTimer = window.setInterval(() => {
                    if (settled) {
                        return;
                    }
                    let htmlNow = el.innerHTML;
                    if (htmlNow !== lastDvHtmlSnap) {
                        lastDvHtmlSnap = htmlNow;
                        mutationCount++;
                        lastMutation = Date.now();
                        pollChangeLogs++;
                        if (pollChangeLogs <= 12) {
                            this.logOnlineRender('stream poll html delta', {
                                path: debugPath,
                                n: pollChangeLogs,
                                sinceStreamMs: Date.now() - tStream,
                                htmlLen: htmlNow.length,
                                dvBlocks: this.countDataviewBlocks(el),
                            });
                        }
                        queuePush();
                        applyDataviewTimingScale();
                        schedule();
                    }
                    applyDataviewTimingScale();
                }, OnlineMarkdownRenderService.ONLINE_DV_POLL_MS);
            };

            const tryUpgradeEmbedIfDvVisible = () => {
                if (settled || timing.profile !== 'embed') {
                    return;
                }
                if (this.countDataviewBlocks(el) < 1) {
                    return;
                }
                timing.profile = 'embed+dataview';
                timing.idleMs = OnlineMarkdownRenderService.ONLINE_DV_IDLE_MS;
                timing.maxMs = OnlineMarkdownRenderService.ONLINE_DV_MAX_MS;
                if (embedProbeTimer) {
                    window.clearInterval(embedProbeTimer);
                    embedProbeTimer = null;
                }
                startDvPollIfNeeded();
                applyDataviewTimingScale();
                armMaxTimer();
                schedule();
            };

            const finish = (reason: 'idle' | 'max') => {
                if (settled) {
                    return;
                }
                settled = true;
                finishReason = reason;
                if (idleTimer) {
                    window.clearTimeout(idleTimer);
                    idleTimer = null;
                }
                if (debouncePushTimer) {
                    window.clearTimeout(debouncePushTimer);
                    debouncePushTimer = null;
                }
                if (dvPollTimer) {
                    window.clearInterval(dvPollTimer);
                    dvPollTimer = null;
                }
                if (embedProbeTimer) {
                    window.clearInterval(embedProbeTimer);
                    embedProbeTimer = null;
                }
                if (maxTimer !== null) {
                    window.clearTimeout(maxTimer);
                    maxTimer = null;
                }

                const pushDone = () => {
                    observer.disconnect();
                    let htmlSnap = el.innerHTML;
                    writeLine(htmlSnap, true);
                    this.logOnlineRender('stream finish', {
                        path: debugPath,
                        reason: finishReason,
                        sinceReqMs: Date.now() - debugSinceReqMs,
                        streamDurationMs: Date.now() - tStream,
                        idleMs: timing.idleMs,
                        maxMs: timing.maxMs,
                        mutationCount,
                        pushedFrames,
                        lastInnerLen: htmlSnap.length,
                        streamProfile: timing.profile,
                        dvBlocks: this.countDataviewBlocks(el),
                        visibilityState:
                            typeof document !== 'undefined' ? document.visibilityState : 'n/a',
                    });
                    resolve();
                };
                // Dataview 常在同一宏任务末尾再写 DOM；立刻读 innerHTML 会偶发截断
                if (OnlineMarkdownRenderService.isDataviewDwellProfile(timing.profile)) {
                    window.setTimeout(() => {
                        if (
                            typeof document !== 'undefined' &&
                            document.visibilityState === 'visible'
                        ) {
                            window.requestAnimationFrame(() => pushDone());
                        } else {
                            window.setTimeout(pushDone, 90);
                        }
                    }, 0);
                } else {
                    pushDone();
                }
            };

            const queuePush = () => {
                if (debouncePushTimer) {
                    window.clearTimeout(debouncePushTimer);
                }
                debouncePushTimer = window.setTimeout(() => {
                    debouncePushTimer = null;
                    if (!settled) {
                        writeLine(el.innerHTML, false);
                    }
                }, 55);
            };

            const schedule = () => {
                if (idleTimer) {
                    window.clearTimeout(idleTimer);
                }
                idleTimer = window.setTimeout(() => {
                    idleTimer = null;
                    tryUpgradeEmbedIfDvVisible();
                    applyDataviewTimingScale();
                    if (settled) {
                        return;
                    }
                    if (Date.now() - lastMutation < timing.idleMs) {
                        schedule();
                        return;
                    }
                    // Dataview 往往晚于首帧才开始改 DOM；若尚无任一次 mutation 就 idle 结束，会截断表格
                    if (
                        OnlineMarkdownRenderService.isDataviewDwellProfile(timing.profile) &&
                        mutationCount === 0 &&
                        Date.now() - tStream < OnlineMarkdownRenderService.ONLINE_DV_BOOTSTRAP_MS
                    ) {
                        schedule();
                        return;
                    }
                    finish('idle');
                }, timing.idleMs);
            };

            const observer = new MutationObserver(() => {
                if (settled) {
                    return;
                }
                mutationCount++;
                lastMutation = Date.now();
                tryUpgradeEmbedIfDvVisible();
                applyDataviewTimingScale();
                if (
                    OnlineMarkdownRenderService.isDataviewDwellProfile(timing.profile) &&
                    mutationCount <= 20
                ) {
                    this.logOnlineRender('stream dom mutation', {
                        path: debugPath,
                        n: mutationCount,
                        sinceStreamMs: Date.now() - tStream,
                        htmlLen: el.innerHTML.length,
                        dvBlocks: this.countDataviewBlocks(el),
                    });
                }
                queuePush();
                schedule();
            });
            // 不监听 attributes：类名/style 等抖动会让「静默」很难达成，普通笔记会白等很久
            observer.observe(el, {
                subtree: true,
                childList: true,
                characterData: true,
            });

            startDvPollIfNeeded();
            applyDataviewTimingScale();
            if (timing.profile === 'embed') {
                embedProbeTimer = window.setInterval(() => {
                    tryUpgradeEmbedIfDvVisible();
                    applyDataviewTimingScale();
                }, 450);
            }

            schedule();
            armMaxTimer();
        });
    }

    /** 仅当前笔记内的 Dataview 块；嵌入里子笔记的 Dataview 不计入（否则会误判成长等 ~10s） */
    private hasOwnNoteDataviewInDom(el: HTMLElement): boolean {
        let nodes = el.querySelectorAll('.block-language-dataview, .block-language-dataviewjs');
        for (let i = 0; i < nodes.length; i++) {
            let n = nodes.item(i);
            if (!n.instanceOf(HTMLElement)) {
                continue;
            }
            if (!n.closest('.internal-embed, .markdown-embed')) {
                return true;
            }
        }
        return false;
    }

    /** /online 渲染调试日志（排查时可取消注释） */
    private logOnlineRender(_phase: string, _detail?: Record<string, unknown>): void {
        // if (!OnlineMarkdownRenderService.ONLINE_RENDER_LOG) {
        //     return;
        // }
        // let extra = '';
        // if (detail && Object.keys(detail).length > 0) {
        //     try {
        //         extra = ' ' + JSON.stringify(detail);
        //     } catch {
        //         extra = ' [detail stringify failed]';
        //     }
        // }
        // console.log('[note-chain /online/render] ' + phase + extra);
    }

    private countDataviewBlocks(el: HTMLElement): number {
        return el.querySelectorAll('.block-language-dataview, .block-language-dataviewjs').length;
    }

    /**
     * 渲染后等待策略：含 Dataview（含嵌入内）用长等；仅嵌入、无 Dataview 时用短上限。
     */
    private getOnlineRenderWaitTiming(
        markdown: string,
        el: HTMLElement,
    ): {
        idleMs: number;
        maxMs: number;
        profile: string;
        hasOwnDvDom: boolean;
        hasDataviewFence: boolean;
        hasEmbed: boolean;
        innerHtmlLen: number;
    } {
        let md = markdown || '';
        let hasDataviewFence =
            /(^|\r?\n)```[\t ]*dataviewjs\b/i.test(md) || /(^|\r?\n)```[\t ]*dataview\b/i.test(md);
        let hasOwnDvDom = this.hasOwnNoteDataviewInDom(el);
        let hasOwnDataview = hasOwnDvDom || hasDataviewFence;
        let innerHtmlLen = el.innerHTML.length;
        let hasEmbed =
            !!el.querySelector(
                '.internal-embed, .markdown-embed, .markdown-embed-content, .markdown-embed-title',
            );
        let dvBlocksAnywhere = this.countDataviewBlocks(el);
        let dvFenceHint = OnlineMarkdownRenderService.countDataviewFencesInMarkdown(md);
        if (hasOwnDataview) {
            let nScale = Math.max(1, dvBlocksAnywhere, dvFenceHint);
            let s = OnlineMarkdownRenderService.scaledDataviewTiming(nScale);
            return {
                idleMs: s.idleMs,
                maxMs: s.maxMs,
                profile: 'dataview',
                hasOwnDvDom,
                hasDataviewFence,
                hasEmbed,
                innerHtmlLen,
            };
        }
        if (hasEmbed && dvBlocksAnywhere > 0) {
            let nScale = Math.max(1, dvBlocksAnywhere, dvFenceHint);
            let s = OnlineMarkdownRenderService.scaledDataviewTiming(nScale);
            return {
                idleMs: s.idleMs,
                maxMs: s.maxMs,
                profile: 'embed+dataview',
                hasOwnDvDom,
                hasDataviewFence,
                hasEmbed,
                innerHtmlLen,
            };
        }
        if (hasEmbed) {
            return {
                idleMs: 52,
                maxMs: 720,
                profile: 'embed',
                hasOwnDvDom,
                hasDataviewFence,
                hasEmbed,
                innerHtmlLen,
            };
        }
        return {
            idleMs: 32,
            maxMs: 180,
            profile: 'plain',
            hasOwnDvDom,
            hasDataviewFence,
            hasEmbed,
            innerHtmlLen,
        };
    }

    /**
     * 使用 Obsidian MarkdownRenderer 将 Markdown 转为 HTML，供 /online 浏览器预览
     *（与库内预览一致：链接、callout、任务列表等由 Obsidian 解析）
     */
    async handleOnlineRender(req: HttpReq, res: HttpRes) {
        let host: HTMLElement | null = null;
        let comp: Component | null = null;
        const tReq = Date.now();
        try {
            let body = await readHttpBody(req);
            const data = parseJsonRecord(body);
            if (!data) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'Invalid JSON body' }));
                return;
            }
            let pathNorm = this.vault.normalizeOnlineVaultPath(typeof data.path === 'string' ? data.path : undefined);
            if (!pathNorm) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'Invalid path' }));
                return;
            }
            let markdown = typeof data.markdown === 'string' ? data.markdown : '';
            let file = this.vault.resolveOnlineMarkdownFile(typeof data.path === 'string' ? data.path : undefined);
            let sourcePath = file ? file.path : pathNorm;
            // 与磁盘一致时先展开 ![[…]] 多层嵌套再渲染，否则 MarkdownRenderer 对「A 嵌 B、B 嵌 C」常展不开 C（含内层 Dataview）
            if (file) {
                try {
                    let rawOnDisk = await this.app.vault.read(file);
                    let normNl = (s: string) => s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                    if (normNl(markdown) === normNl(rawOnDisk)) {
                        let nc = noteChainPlugin(this.app);
                        if (nc?.easyapi?.file) {
                            markdown = await nc.easyapi.file.read_tfile_with_embeds(file, 10);
                        }
                    }
                } catch {
                    /* 保持请求体 markdown */
                }
            }
            this.logOnlineRender('request parsed', {
                path: pathNorm,
                mdChars: markdown.length,
                sinceReqMs: Date.now() - tReq,
            });
            let el = createDiv({ cls: 'markdown-rendered' });
            comp = new Component();
            comp.load();
            host = createDiv({ cls: 'nc-online-offscreen-host' });
            document.body.appendChild(host);
            host.appendChild(el);
            res.writeHead(200, {
                'Content-Type': 'application/x-ndjson; charset=utf-8',
                'Cache-Control': 'no-cache',
                'X-Accel-Buffering': 'no',
                'Access-Control-Allow-Origin': '*',
            });
            res.write(
                JSON.stringify({
                    html: '<div class="markdown-rendered"><p class="online-loading">生成预览中…</p></div>',
                    done: false,
                }) + '\n',
            );
            if (typeof res.flush === 'function') {
                res.flush();
            }
            this.logOnlineRender('placeholder flushed, MarkdownRenderer.render start', {
                path: pathNorm,
                sinceReqMs: Date.now() - tReq,
            });
            const tRenderStart = Date.now();
            await MarkdownRenderer.render(this.app, markdown, el, sourcePath, comp);
            const tRenderEnd = Date.now();
            const renderMs = tRenderEnd - tRenderStart;
            this.logOnlineRender('MarkdownRenderer.render done', {
                path: pathNorm,
                renderMs,
                sinceReqMs: Date.now() - tReq,
                innerLen: el.innerHTML.length,
            });
            let mdProbe = typeof markdown === 'string' ? markdown : '';
            let mdLikelyDataview =
                /(^|\r?\n)```[\t ]*dataviewjs\b/i.test(mdProbe) ||
                /(^|\r?\n)```[\t ]*dataview\b/i.test(mdProbe);
            let dataviewPluginOn = !!obsidianApp(this.app).plugins?.plugins?.['dataview'];
            this.logOnlineRender('post-render probe', {
                path: pathNorm,
                mdLikelyDataview,
                dataviewPluginOn,
                dvBlocks: this.countDataviewBlocks(el),
                visibilityState:
                    typeof document !== 'undefined' ? document.visibilityState : 'n/a',
            });
            // 勿在此调用 dataview:dataview-force-refresh-views：会全局重跑视图，MarkdownRenderer 刚写入的块常被再执行一次，出现 dv.span 等输出重复（双链接）
            // 不要用双 requestAnimationFrame：窗口在后台时 rAF 会拖到下一次 vsync（可达数秒）
            await new Promise<void>((r) => window.setTimeout(r, 0));
            const tYieldEnd = Date.now();
            let timing = this.getOnlineRenderWaitTiming(markdown, el);
            if (
                OnlineMarkdownRenderService.isDataviewDwellProfile(timing.profile) &&
                typeof document !== 'undefined'
            ) {
                if (document.visibilityState === 'visible') {
                    await new Promise<void>((r) => window.requestAnimationFrame(() => r()));
                } else {
                    await new Promise<void>((r) => window.setTimeout(r, 120));
                }
            }
            this.logOnlineRender('wait timing', {
                path: pathNorm,
                profile: timing.profile,
                idleMs: timing.idleMs,
                maxMs: timing.maxMs,
                hasOwnDvDom: timing.hasOwnDvDom,
                hasDataviewFence: timing.hasDataviewFence,
                hasEmbed: timing.hasEmbed,
                innerHtmlLen: timing.innerHtmlLen,
                dvBlocks: this.countDataviewBlocks(el),
                postRenderYieldMs: tYieldEnd - tRenderEnd,
                sinceReqMs: Date.now() - tReq,
                visibilityState:
                    typeof document !== 'undefined' ? document.visibilityState : 'n/a',
            });
            let dvFenceHint = OnlineMarkdownRenderService.countDataviewFencesInMarkdown(markdown);
            await this.streamOnlineRenderNdjson(
                res,
                el,
                timing.idleMs,
                timing.maxMs,
                sourcePath,
                pathNorm,
                tReq,
                timing.profile,
                dvFenceHint,
            );
            this.logOnlineRender('handleOnlineRender complete', {
                path: pathNorm,
                totalMs: Date.now() - tReq,
            });
        } catch (error: unknown) {
            this.logOnlineRender('handleOnlineRender error', {
                message: errorMessage(error) || String(error),
                sinceReqMs: Date.now() - tReq,
            });
            if (res.headersSent) {
                try {
                    res.write(
                        JSON.stringify({
                            error: errorMessage(error) || 'render failed',
                            done: true,
                        }) + '\n',
                    );
                } catch {
                    // ignore
                }
            } else {
                res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: errorMessage(error) || 'render failed' }));
            }
        } finally {
            if (host && host.parentNode) {
                host.parentNode.removeChild(host);
            }
            if (comp) {
                comp.unload();
            }
            if (!res.writableEnded) {
                res.end();
            }
        }
    }
}
