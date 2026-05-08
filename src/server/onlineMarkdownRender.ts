import { App, Component, MarkdownRenderer, TFile } from 'obsidian';
import { readHttpBody } from './httpUtil';
import type { OnlineVaultMediaService } from './onlineVaultMedia';

export class OnlineMarkdownRenderService {
    constructor(
        private app: App,
        private vault: OnlineVaultMediaService,
    ) {}

    /**
     * 将 Markdown 渲染为 HTML 并以 NDJSON 流推送：首帧尽快返回，Dataview 等异步更新时防抖刷新，最后 done:true。
     * 每行一个 JSON：{ html, done? , error? }
     */
    private async streamOnlineRenderNdjson(
        res: any,
        el: HTMLElement,
        idleMs: number,
        maxMs: number,
        sourcePath: string,
        debugPath: string,
        debugSinceReqMs: number,
        streamProfile: string,
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
                (res as any).flush();
            }
        };

        writeLine(el.innerHTML, false);
        this.logOnlineRender('stream first frame', {
            path: debugPath,
            sinceReqMs: Date.now() - debugSinceReqMs,
            sinceStreamMs: Date.now() - tStream,
            htmlLen: el.innerHTML.length,
            pushedFrames,
        });

        await new Promise<void>((resolve) => {
            let settled = false;
            let lastMutation = Date.now();
            let idleTimer: ReturnType<typeof setTimeout> | null = null;
            let debouncePushTimer: ReturnType<typeof setTimeout> | null = null;
            let finishReason: 'idle' | 'max' | 'unknown' = 'unknown';

            const finish = (reason: 'idle' | 'max') => {
                if (settled) {
                    return;
                }
                settled = true;
                finishReason = reason;
                if (idleTimer) {
                    clearTimeout(idleTimer);
                    idleTimer = null;
                }
                if (debouncePushTimer) {
                    clearTimeout(debouncePushTimer);
                    debouncePushTimer = null;
                }
                clearTimeout(maxTimer);
                observer.disconnect();
                writeLine(el.innerHTML, true);
                this.logOnlineRender('stream finish', {
                    path: debugPath,
                    reason: finishReason,
                    sinceReqMs: Date.now() - debugSinceReqMs,
                    streamDurationMs: Date.now() - tStream,
                    idleMs,
                    maxMs,
                    mutationCount,
                    pushedFrames,
                    lastInnerLen: el.innerHTML.length,
                    streamProfile,
                });
                resolve();
            };

            const queuePush = () => {
                if (debouncePushTimer) {
                    clearTimeout(debouncePushTimer);
                }
                debouncePushTimer = setTimeout(() => {
                    debouncePushTimer = null;
                    if (!settled) {
                        writeLine(el.innerHTML, false);
                    }
                }, 55);
            };

            const schedule = () => {
                if (idleTimer) {
                    clearTimeout(idleTimer);
                }
                idleTimer = setTimeout(() => {
                    idleTimer = null;
                    if (Date.now() - lastMutation < idleMs) {
                        schedule();
                        return;
                    }
                    // Dataview 往往晚于首帧才开始改 DOM；若尚无任一次 mutation 就 idle 结束，会截断表格
                    let dvBootstrapMs = 1100;
                    if (
                        streamProfile === 'dataview' &&
                        mutationCount === 0 &&
                        Date.now() - tStream < dvBootstrapMs
                    ) {
                        schedule();
                        return;
                    }
                    finish('idle');
                }, idleMs);
            };

            const observer = new MutationObserver(() => {
                mutationCount++;
                lastMutation = Date.now();
                queuePush();
                schedule();
            });
            // 不监听 attributes：类名/style 等抖动会让「静默」很难达成，普通笔记会白等很久
            observer.observe(el, {
                subtree: true,
                childList: true,
                characterData: true,
            });

            schedule();
            const maxTimer = setTimeout(() => finish('max'), maxMs);
        });
    }

    /** 仅当前笔记内的 Dataview 块；嵌入里子笔记的 Dataview 不计入（否则会误判成长等 ~10s） */
    private hasOwnNoteDataviewInDom(el: HTMLElement): boolean {
        let nodes = el.querySelectorAll('.block-language-dataview, .block-language-dataviewjs');
        for (let i = 0; i < nodes.length; i++) {
            let n = nodes.item(i);
            if (!(n instanceof HTMLElement)) {
                continue;
            }
            if (!n.closest('.internal-embed, .markdown-embed')) {
                return true;
            }
        }
        return false;
    }

    /** /online 渲染调试日志（输出到 Obsidian 开发者工具控制台） */
    private logOnlineRender(phase: string, detail?: Record<string, unknown>): void {
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

    /**
     * 渲染后等待策略：仅「本页」Dataview 长等；嵌入走短上限；避免嵌入内 Dataview 拖满 10s+。
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
        if (hasOwnDataview) {
            return {
                idleMs: 400,
                maxMs: 7200,
                profile: 'dataview',
                hasOwnDvDom,
                hasDataviewFence,
                hasEmbed: false,
                innerHtmlLen,
            };
        }
        let hasEmbed =
            !!el.querySelector(
                '.internal-embed, .markdown-embed, .markdown-embed-content, .markdown-embed-title',
            );
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
    async handleOnlineRender(req: any, res: any) {
        let host: HTMLElement | null = null;
        let comp: Component | null = null;
        const tReq = Date.now();
        try {
            let body = await readHttpBody(req);
            let data: any = {};
            try {
                data = JSON.parse(body);
            } catch {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'Invalid JSON body' }));
                return;
            }
            let pathNorm = this.vault.normalizeOnlineVaultPath(data.path);
            if (!pathNorm) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'Invalid path' }));
                return;
            }
            let markdown = typeof data.markdown === 'string' ? data.markdown : '';
            let file = this.vault.resolveOnlineMarkdownFile(data.path);
            let sourcePath = file ? file.path : pathNorm;
            this.logOnlineRender('request parsed', {
                path: pathNorm,
                mdChars: markdown.length,
                sinceReqMs: Date.now() - tReq,
            });
            let el = document.createElement('div');
            el.classList.add('markdown-rendered');
            comp = new Component();
            comp.load();
            host = document.createElement('div');
            host.style.cssText =
                'position:fixed;left:-99999px;top:0;width:920px;max-width:100vw;opacity:0;pointer-events:none;z-index:-1;overflow:hidden;';
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
            if (typeof (res as any).flush === 'function') {
                (res as any).flush();
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
            // 不要用双 requestAnimationFrame：窗口在后台时 rAF 会拖到下一次 vsync（可达数秒）
            await new Promise<void>((r) => setTimeout(r, 0));
            const tYieldEnd = Date.now();
            let timing = this.getOnlineRenderWaitTiming(markdown, el);
            if (
                timing.profile === 'dataview' &&
                typeof document !== 'undefined' &&
                document.visibilityState === 'visible'
            ) {
                await new Promise<void>((r) => requestAnimationFrame(() => r()));
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
                postRenderYieldMs: tYieldEnd - tRenderEnd,
                sinceReqMs: Date.now() - tReq,
            });
            await this.streamOnlineRenderNdjson(
                res,
                el,
                timing.idleMs,
                timing.maxMs,
                sourcePath,
                pathNorm,
                tReq,
                timing.profile,
            );
            this.logOnlineRender('handleOnlineRender complete', {
                path: pathNorm,
                totalMs: Date.now() - tReq,
            });
        } catch (error: any) {
            this.logOnlineRender('handleOnlineRender error', {
                message: error?.message || String(error),
                sinceReqMs: Date.now() - tReq,
            });
            if (res.headersSent) {
                try {
                    res.write(
                        JSON.stringify({
                            error: error.message || 'render failed',
                            done: true,
                        }) + '\n',
                    );
                } catch {
                    // ignore
                }
            } else {
                res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: error.message || 'render failed' }));
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
