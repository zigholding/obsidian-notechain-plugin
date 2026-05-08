import { App, TFile } from 'obsidian';
import { readHttpBody } from './httpUtil';
import { ONLINE_PAGE_HTML } from './onlinePageHtml';
import { OnlineVaultMediaService } from './onlineVaultMedia';
import { OnlineMarkdownRenderService } from './onlineMarkdownRender';

/** /online 与 /online/api/* 路由处理（页面、笔记 CRUD、textarea 按钮、渲染委托） */
export class OnlineHttpHandlers {
    private vault: OnlineVaultMediaService;
    private render: OnlineMarkdownRenderService;

    constructor(private app: App) {
        this.vault = new OnlineVaultMediaService(app);
        this.render = new OnlineMarkdownRenderService(app, this.vault);
    }

    async handleOnlinePage(req: any, res: any) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(ONLINE_PAGE_HTML);
    }

    /** 与 easyapi.file.get_tfile 一致：标题、basename、部分路径、[[链接]] 等均可解析为 vault 路径 */
    async handleOnlineResolveNote(req: any, res: any, parsedUrl: any) {
        try {
            let nameRaw = parsedUrl.query && (parsedUrl.query.name as string | undefined);
            let name = (nameRaw || '').trim();
            if (!name) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'name query parameter is required' }));
                return;
            }
            let nc = (this.app as any).plugins?.getPlugin?.('note-chain');
            if (!nc?.easyapi?.file?.get_tfile) {
                res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'note-chain plugin not available' }));
                return;
            }
            let tfile = nc.easyapi.file.get_tfile(name, true);
            if (!tfile || !(tfile instanceof TFile) || tfile.extension !== 'md') {
                res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'Note not found' }));
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ path: tfile.path, basename: tfile.basename }));
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: error.message || 'resolve-note failed' }));
        }
    }

    async handleOnlineSearch(req: any, res: any, parsedUrl: any) {
        try {
            let qRaw = parsedUrl.query && (parsedUrl.query.q as string | undefined);
            let term = (qRaw || '').trim().toLowerCase();
            if (!term) {
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ results: [] }));
                return;
            }
            let files = this.app.vault.getMarkdownFiles();
            let hits: { path: string; basename: string }[] = [];
            for (let f of files) {
                let pathLower = f.path.toLowerCase();
                let baseLower = f.basename.toLowerCase();
                if (pathLower.includes(term) || baseLower.includes(term)) {
                    hits.push({ path: f.path, basename: f.basename });
                }
            }
            hits.sort((a, b) => a.path.localeCompare(b.path));
            let limit = 100;
            if (hits.length > limit) {
                hits = hits.slice(0, limit);
            }
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ results: hits }));
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: error.message || 'search failed' }));
        }
    }

    async handleOnlineMedia(req: any, res: any, parsedUrl: any) {
        return this.vault.handleOnlineMedia(req, res, parsedUrl);
    }

    /** 与 NCTextarea 按钮逻辑对齐：命令 / get_str_func / templater 文件（Online 浏览器端交互） */
    async handleOnlineTextareaExec(req: any, res: any) {
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
            let sourceFile = this.vault.resolveOnlineMarkdownFile(data.path);
            if (!sourceFile) {
                res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'Note not found' }));
                return;
            }
            let fname = String(data.fname || '').trim();
            if (!fname) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'fname required' }));
                return;
            }
            let nc = (this.app as any).plugins?.getPlugin?.('note-chain');
            if (!nc) {
                res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'note-chain plugin not available' }));
                return;
            }
            let textareaValue =
                data.textareaValue === undefined || data.textareaValue === null
                    ? ''
                    : String(data.textareaValue);
            let source = typeof data.source === 'string' ? data.source : '';
            let params = data.params;
            let pe =
                params &&
                typeof params === 'object' &&
                !Array.isArray(params) &&
                (params as any).extra &&
                typeof (params as any).extra === 'object' &&
                !Array.isArray((params as any).extra)
                    ? { ...(params as any).extra }
                    : {};
            let reFlat =
                data.extra && typeof data.extra === 'object' && !Array.isArray(data.extra)
                    ? { ...(data.extra as Record<string, unknown>) }
                    : {};
            let flatAddon: Record<string, unknown> = { ...pe, ...reFlat, from_online: true };
            let fifthArg =
                params !== undefined && params !== null && typeof params === 'object' && !Array.isArray(params)
                    ? { ...(params as Record<string, unknown>), ...flatAddon }
                    : params !== undefined && params !== null
                      ? { params, ...flatAddon }
                      : { ...flatAddon };

            let cmd = (this.app as any).commands?.findCommand?.(fname);
            if (cmd) {
                (this.app as any).commands.executeCommandById(fname);
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ ok: true }));
                return;
            }

            let taMethod = (nc.textarea as any)[fname];
            if (typeof taMethod === 'function') {
                let val = textareaValue;
                let mockArea: any = {};
                Object.defineProperty(mockArea, 'value', {
                    configurable: true,
                    enumerable: true,
                    get() {
                        return val;
                    },
                    set(v: string) {
                        val = String(v);
                    },
                });
                mockArea.style = {};
                mockArea.focus = () => {};
                mockArea.select = () => {};
                let mockEl: any = {};
                let mockCtx: any = { sourcePath: sourceFile.path };
                let ret = taMethod.call(nc.textarea, mockArea, source, mockEl, mockCtx, fifthArg);
                if (ret && typeof (ret as any).then === 'function') {
                    await ret;
                }
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ ok: true, newValue: val }));
                return;
            }

            let ufunc = await nc.utils.get_str_func(this.app, fname);
            if (typeof ufunc === 'function') {
                let val = textareaValue;
                let mockArea: any = {};
                Object.defineProperty(mockArea, 'value', {
                    configurable: true,
                    enumerable: true,
                    get() {
                        return val;
                    },
                    set(v: string) {
                        val = String(v);
                    },
                });
                mockArea.style = {};
                mockArea.focus = () => {};
                mockArea.select = () => {};
                let mockEl: any = {};
                let mockCtx: any = { sourcePath: sourceFile.path };
                let ret = ufunc(mockArea, source, mockEl, mockCtx, fifthArg);
                if (ret && typeof (ret as any).then === 'function') {
                    await ret;
                }
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ ok: true, newValue: val }));
                return;
            }

            let tfile = nc.easyapi.file.get_tfile(fname);
            if (tfile) {
                let tplTags = nc.settings?.notechain?.tpl_tags_folder as any;
                let tagInTplFolder = (tag: string): boolean => {
                    if (!tplTags) {
                        return false;
                    }
                    if (typeof tplTags.contains === 'function') {
                        return tplTags.contains(tag);
                    }
                    if (typeof tplTags === 'string') {
                        let lines = tplTags
                            .trim()
                            .split(/\n/)
                            .map((s: string) => s.trim())
                            .filter(Boolean);
                        return lines.indexOf(tag) >= 0;
                    }
                    return false;
                };
                let tags = nc.easyapi.file
                    .get_tags(tfile)
                    .map((x: string) => x.slice(1))
                    .filter((x: string) => tagInTplFolder(x));
                if (tags.length > 0) {
                    let val = textareaValue;
                    let mockArea: any = {};
                    Object.defineProperty(mockArea, 'value', {
                        configurable: true,
                        enumerable: true,
                        get() {
                            return val;
                        },
                        set(v: string) {
                            val = String(v);
                        },
                    });
                    mockArea.style = {};
                    mockArea.focus = () => {};
                    mockArea.select = () => {};
                    let tplExtra: any = {
                        area: mockArea,
                        source: source,
                        el: {},
                        ctx: { sourcePath: sourceFile.path },
                        params: params,
                        ...flatAddon,
                    };
                    Object.defineProperty(tplExtra, 'textareaValue', {
                        configurable: true,
                        enumerable: true,
                        get() {
                            return val;
                        },
                        set(v: string) {
                            val = String(v);
                        },
                    });
                    Object.defineProperty(tplExtra, 'text', {
                        configurable: true,
                        enumerable: true,
                        get() {
                            return val;
                        },
                        set(v: string) {
                            val = String(v);
                        },
                    });
                    await nc.easyapi.tpl.parse_templater(fname, true, tplExtra);
                    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ ok: true, newValue: val }));
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(
                    JSON.stringify({
                        ok: false,
                        notice: '该文件需在 Obsidian 内打开（无 templater 标签）',
                    }),
                );
                return;
            }

            res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'Unknown button target: ' + fname }));
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: error.message || 'textarea-exec failed' }));
        }
    }

    async handleOnlineNoteGet(req: any, res: any, parsedUrl: any) {
        try {
            let pathParam = parsedUrl.query && (parsedUrl.query.path as string | undefined);
            let file = this.vault.resolveOnlineMarkdownFile(pathParam);
            if (!file) {
                res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'Note not found or not a markdown file' }));
                return;
            }
            let content = await this.app.vault.read(file);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(
                JSON.stringify({
                    path: file.path,
                    basename: file.basename,
                    content,
                }),
            );
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: error.message || 'read failed' }));
        }
    }

    async handleOnlineNoteSave(req: any, res: any) {
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
            let file = this.vault.resolveOnlineMarkdownFile(data.path);
            if (!file) {
                res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'Note not found or not a markdown file' }));
                return;
            }
            let content = typeof data.content === 'string' ? data.content : '';
            await this.app.vault.modify(file, content);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: true, path: file.path }));
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: error.message || 'save failed' }));
        }
    }

    async handleOnlineRender(req: any, res: any) {
        return this.render.handleOnlineRender(req, res);
    }

    /** 解析 [[wikilink]] / 内部链接，供浏览器内跳转 */
    async handleOnlineResolveLink(req: any, res: any, parsedUrl: any) {
        try {
            let fromRaw = parsedUrl.query && (parsedUrl.query.from as string | undefined);
            let toRaw = parsedUrl.query && (parsedUrl.query.to as string | undefined);
            let from = this.vault.normalizeOnlineVaultPath(fromRaw);
            let to = (toRaw || '').trim();
            if (!from || !to) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'from and to are required' }));
                return;
            }
            let dest = this.app.metadataCache.getFirstLinkpathDest(to, from);
            if (!dest || !(dest instanceof TFile) || dest.extension !== 'md') {
                res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'Linked note not found' }));
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ path: dest.path, basename: dest.basename }));
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: error.message || 'resolve failed' }));
        }
    }
}
