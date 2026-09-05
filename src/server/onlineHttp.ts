import { App, TFile } from 'obsidian';
import { readHttpBody } from './httpUtil';
import { ONLINE_PAGE_HTML } from './onlinePageHtml';
import { OnlineVaultMediaService } from './onlineVaultMedia';
import { OnlineMarkdownRenderService } from './onlineMarkdownRender';
import type { HttpReq, HttpRes, ParsedReqUrl } from '../http-types';
import { parseJsonRecord } from '../http-types';
import { noteChainPlugin, obsidianApp } from '../obsidian-app';
import { errorMessage, isRecord, isThenable } from '../ts-helpers';

type MockTextarea = {
	value: string;
	style: Record<string, string>;
	focus: () => void;
	select: () => void;
};

function createMockTextarea(initial: string): { area: MockTextarea; getValue: () => string } {
	let val = initial;
	const area: MockTextarea = {
		get value() {
			return val;
		},
		set value(v: string) {
			val = String(v);
		},
		style: {},
		focus: () => {},
		select: () => {},
	};
	return { area, getValue: () => val };
}

/** /online 与 /online/api/* 路由处理（页面、笔记 CRUD、textarea 按钮、渲染委托） */
export class OnlineHttpHandlers {
    private vault: OnlineVaultMediaService;
    private render: OnlineMarkdownRenderService;

    constructor(private app: App) {
        this.vault = new OnlineVaultMediaService(app);
        this.render = new OnlineMarkdownRenderService(app, this.vault);
    }

    async handleOnlinePage(req: HttpReq, res: HttpRes) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(ONLINE_PAGE_HTML);
    }

    /** 与 easyapi.file.get_tfile 一致：标题、basename、部分路径、[[链接]] 等均可解析为 vault 路径 */
    async handleOnlineResolveNote(req: HttpReq, res: HttpRes, parsedUrl: ParsedReqUrl) {
        try {
            let nameRaw = parsedUrl.query && (parsedUrl.query.name as string | undefined);
            let name = (nameRaw || '').trim();
            if (!name) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'name query parameter is required' }));
                return;
            }
            let nc = noteChainPlugin(this.app);
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
        } catch (error: unknown) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: errorMessage(error) || 'resolve-note failed' }));
        }
    }

    async handleOnlineSearch(req: HttpReq, res: HttpRes, parsedUrl: ParsedReqUrl) {
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
        } catch (error: unknown) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: errorMessage(error) || 'search failed' }));
        }
    }

    async handleOnlineMedia(req: HttpReq, res: HttpRes, parsedUrl: ParsedReqUrl) {
        return this.vault.handleOnlineMedia(req, res, parsedUrl);
    }

    /** 与 NCTextarea 按钮逻辑对齐：命令 / get_str_func / templater 文件（Online 浏览器端交互） */
    async handleOnlineTextareaExec(req: HttpReq, res: HttpRes) {
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
            let sourceFile = this.vault.resolveOnlineMarkdownFile(typeof data.path === 'string' ? data.path : undefined);
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
            let nc = noteChainPlugin(this.app);
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
                isRecord(params) && isRecord(params.extra)
                    ? { ...params.extra }
                    : {};
            let reFlat = isRecord(data.extra) ? { ...data.extra } : {};
            let flatAddon: Record<string, unknown> = { ...pe, ...reFlat, from_online: true };
            let fifthArg =
                isRecord(params)
                    ? { ...params, ...flatAddon }
                    : params !== undefined && params !== null
                      ? { params, ...flatAddon }
                      : { ...flatAddon };

            let cmd = obsidianApp(this.app).commands?.findCommand?.(fname);
            if (cmd) {
                void obsidianApp(this.app).commands.executeCommandById(fname);
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ ok: true }));
                return;
            }

            const taMethod = (nc.textarea as unknown as Record<string, unknown>)[fname];
            if (typeof taMethod === 'function') {
                const mock = createMockTextarea(textareaValue);
                const mockEl: Record<string, unknown> = {};
                const mockCtx = { sourcePath: sourceFile.path };
                const ret = taMethod.call(nc.textarea, mock.area, source, mockEl, mockCtx, fifthArg);
                if (isThenable(ret)) {
                    await ret;
                }
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ ok: true, newValue: mock.getValue() }));
                return;
            }

            let ufunc = await nc.utils.get_str_func(this.app, fname);
            if (typeof ufunc === 'function') {
                const mock = createMockTextarea(textareaValue);
                const mockEl: Record<string, unknown> = {};
                const mockCtx = { sourcePath: sourceFile.path };
                const ret = ufunc(mock.area, source, mockEl, mockCtx, fifthArg);
                if (isThenable(ret)) {
                    await ret;
                }
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ ok: true, newValue: mock.getValue() }));
                return;
            }

            let tfile = nc.easyapi.file.get_tfile(fname);
            if (tfile) {
                let tplTags = nc.settings?.notechain?.tpl_tags_folder;
                let tagInTplFolder = (tag: string): boolean => {
                    if (!tplTags) {
                        return false;
                    }
                    if (typeof tplTags === 'string') {
                        let lines = tplTags
                            .trim()
                            .split(/\n/)
                            .map((s) => s.trim())
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
                    const mock = createMockTextarea(textareaValue);
                    const tplExtra: Record<string, unknown> = {
                        area: mock.area,
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
                            return mock.getValue();
                        },
                        set(v: string) {
                            mock.area.value = String(v);
                        },
                    });
                    Object.defineProperty(tplExtra, 'text', {
                        configurable: true,
                        enumerable: true,
                        get() {
                            return mock.getValue();
                        },
                        set(v: string) {
                            mock.area.value = String(v);
                        },
                    });
                    // Online 需在 #msg 展示「解析结果」：extract=true 只跑 <%* %> / 围栏块，块返回值常为 ''。
                    // extract=false 对去 frontmatter 后的全文做一次 parse，得到与阅读视图一致的拼接输出。
                    let tplBlocks = await nc.easyapi.tpl.parse_templater(fname, false, tplExtra);
                    let tplResult = Array.isArray(tplBlocks)
                        ? tplBlocks.map((item: unknown) => {
                              if (item == null) return '';
                              if (typeof item === 'string') return item;
                              try {
                                  return JSON.stringify(item);
                              } catch {
                                  return String(item);
                              }
                          })
                        : [];
                    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ ok: true, newValue: mock.getValue(), tplResult }));
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
        } catch (error: unknown) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: errorMessage(error) || 'textarea-exec failed' }));
        }
    }

    async handleOnlineNoteGet(req: HttpReq, res: HttpRes, parsedUrl: ParsedReqUrl) {
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
        } catch (error: unknown) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: errorMessage(error) || 'read failed' }));
        }
    }

    async handleOnlineNoteSave(req: HttpReq, res: HttpRes) {
        try {
            let body = await readHttpBody(req);
            const data = parseJsonRecord(body);
            if (!data) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'Invalid JSON body' }));
                return;
            }
            let file = this.vault.resolveOnlineMarkdownFile(typeof data.path === 'string' ? data.path : undefined);
            if (!file) {
                res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'Note not found or not a markdown file' }));
                return;
            }
            let content = typeof data.content === 'string' ? data.content : '';
            await this.app.vault.modify(file, content);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: true, path: file.path }));
        } catch (error: unknown) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: errorMessage(error) || 'save failed' }));
        }
    }

    async handleOnlineRender(req: HttpReq, res: HttpRes) {
        return this.render.handleOnlineRender(req, res);
    }

    /** 解析 [[wikilink]] / 内部链接，供浏览器内跳转 */
    async handleOnlineResolveLink(req: HttpReq, res: HttpRes, parsedUrl: ParsedReqUrl) {
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
        } catch (error: unknown) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: errorMessage(error) || 'resolve failed' }));
        }
    }
}
