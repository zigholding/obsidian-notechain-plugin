import { App, TFile, normalizePath } from 'obsidian';
import type { HttpReq, HttpRes, ParsedReqUrl } from '../http-types';
import { noteChainPlugin, vaultAdapter } from '../obsidian-app';
import { errorMessage } from '../ts-helpers';

export class OnlineVaultMediaService {
    constructor(private app: App) {}

    /** 在线页：仅允许 vault 相对路径，拒绝明显越界 */
    normalizeOnlineVaultPath(raw: string | undefined): string | null {
        if (!raw || typeof raw !== 'string') {
            return null;
        }
        let p = raw.replace(/\\/g, '/').trim();
        if (p.includes('..')) {
            return null;
        }
        while (p.startsWith('/')) {
            p = p.slice(1);
        }
        return p.length ? p : null;
    }

    resolveOnlineMarkdownFile(pathParam: string | undefined): TFile | null {
        let p = this.normalizeOnlineVaultPath(pathParam);
        if (!p) {
            return null;
        }
        let abs = this.app.vault.getAbstractFileByPath(p);
        if (!abs || !(abs instanceof TFile)) {
            return null;
        }
        if (abs.extension !== 'md') {
            return null;
        }
        return abs;
    }

    private getVaultRootAbsNorm(): string | null {
        let adapter = vaultAdapter(this.app);
        let getFullPath = adapter.getFullPath;
        if (typeof getFullPath !== 'function') {
            return null;
        }
        for (let key of ['.', '']) {
            try {
                let abs = getFullPath.call(adapter, key);
                if (abs && typeof abs === 'string') {
                    return abs.replace(/\\/g, '/');
                }
            } catch {
                // try next
            }
        }
        return null;
    }

    private absPathToVaultRel(fsPathRaw: string): string | null {
        let fsPath = fsPathRaw.replace(/\\/g, '/').trim();
        let root = this.getVaultRootAbsNorm();
        if (!root) {
            return null;
        }
        let lowerRoot = root.toLowerCase();
        let lowerPath = fsPath.toLowerCase();
        if (!lowerPath.startsWith(lowerRoot)) {
            return null;
        }
        let rest = fsPath.slice(root.length).replace(/^\/+/, '');
        if (!rest.length || rest.includes('..')) {
            return null;
        }
        let f = this.app.vault.getAbstractFileByPath(rest);
        return f instanceof TFile ? rest : null;
    }

    private joinMediaPathFromSource(sourcePath: string, href: string): string | null {
        let h = href.trim();
        if (!h.length) {
            return null;
        }
        if (/^[a-z][a-z0-9+.-]*:\/\//i.test(h)) {
            return null;
        }
        let dir = '';
        if (sourcePath.includes('/')) {
            dir = sourcePath.slice(0, sourcePath.lastIndexOf('/'));
        }
        let joined = dir.length ? normalizePath(dir + '/' + h) : normalizePath(h);
        joined = joined.replace(/\\/g, '/');
        let norm = this.normalizeOnlineVaultPath(joined);
        if (!norm) {
            return null;
        }
        let f = this.app.vault.getAbstractFileByPath(norm);
        return f instanceof TFile ? norm : null;
    }

    /** app://…、file://… 转为 vault 相对路径 */
    private resolveSpecialUrlToVaultPath(raw: string): string | null {
        let s = raw.trim();
        try {
            s = decodeURIComponent(s);
        } catch {
            // keep
        }
        if (!s.length) {
            return null;
        }
        if (/^app:\/\/local\//i.test(s)) {
            let tail = s.slice('app://local/'.length);
            try {
                tail = decodeURIComponent(tail.replace(/\+/g, '%20'));
            } catch {
                // keep
            }
            let fsNorm = tail.replace(/\\/g, '/');
            return this.absPathToVaultRel(fsNorm);
        }
        let mHost = s.match(/^app:\/\/[^/]+\/(.+)$/i);
        if (mHost) {
            let rest = mHost[1];
            try {
                rest = decodeURIComponent(rest.replace(/\+/g, '%20'));
            } catch {
                // keep
            }
            rest = rest.replace(/\\/g, '/').replace(/^\/+/, '');
            if (!rest.includes('..')) {
                let f = this.app.vault.getAbstractFileByPath(rest);
                if (f instanceof TFile) {
                    return rest;
                }
                let byAbs = this.absPathToVaultRel(rest);
                if (byAbs) {
                    return byAbs;
                }
            }
        }
        if (/^file:\/\//i.test(s)) {
            let p = s.replace(/^file:\/\//i, '');
            if (p.startsWith('///')) {
                p = p.slice(2);
            } else if (p.startsWith('//')) {
                p = p.slice(1);
            }
            try {
                p = decodeURIComponent(p);
            } catch {
                // keep
            }
            let fsNorm = p.replace(/\\/g, '/');
            return this.absPathToVaultRel(fsNorm);
        }
        return null;
    }

    private resolveSrcToVaultPathForOnline(src: string, sourcePath: string): string | null {
        if (!src.trim().length || src.includes('/online/api/media?')) {
            return null;
        }
        let decoded = src.trim();
        try {
            decoded = decodeURIComponent(decoded);
        } catch {
            // keep
        }
        if (/^(app|file):/i.test(decoded)) {
            return this.resolveSpecialUrlToVaultPath(decoded);
        }
        if (/^https?:\/\//i.test(decoded)) {
            return null;
        }
        let rel = this.joinMediaPathFromSource(sourcePath, decoded);
        if (rel) {
            return rel;
        }
        let only = this.normalizeOnlineVaultPath(decoded.replace(/\\/g, '/'));
        if (only) {
            let f = this.app.vault.getAbstractFileByPath(only);
            if (f instanceof TFile) {
                return only;
            }
        }
        return null;
    }

    rewriteOnlinePreviewHtml(html: string, sourcePath: string): string {
        if (!html.length) {
            return html;
        }
        let wrap = createDiv();
        wrap.append(...Array.from(new DOMParser().parseFromString(html, 'text/html').body.childNodes));
        let sel = 'img[src], video[src], audio[src], source[src]';
        wrap.querySelectorAll(sel).forEach((node) => {
            let src = node.getAttribute('src');
            if (!src) {
                return;
            }
            let vaultPath = this.resolveSrcToVaultPathForOnline(src, sourcePath);
            if (vaultPath) {
                node.setAttribute('src', '/online/api/media?path=' + encodeURIComponent(vaultPath));
            }
        });
        wrap.querySelectorAll('img[data-src], video[data-src]').forEach((node) => {
            let ds = node.getAttribute('data-src');
            if (!ds) {
                return;
            }
            let vaultPath = this.resolveSrcToVaultPathForOnline(ds, sourcePath);
            if (vaultPath) {
                node.setAttribute('data-src', '/online/api/media?path=' + encodeURIComponent(vaultPath));
            }
        });
        return wrap.innerHTML;
    }

    /** `filename=数独.html` 或 `[[folder/数独.html]]`：只认 .html / .htm，并解析到库内文件 */
    resolveOnlineHtmlFile(rawName: string): TFile | null {
        const name = htmlLookupName(rawName);
        if (!name) {
            return null;
        }
        const via = noteChainPlugin(this.app)?.easyapi?.file?.get_tfile(name, true);
        if (via instanceof TFile && isHtmlExtension(via.extension)) {
            return via;
        }
        const normalized = name.replace(/\\/g, '/');
        const byPath = this.normalizeOnlineVaultPath(normalized);
        if (byPath) {
            const abs = this.app.vault.getAbstractFileByPath(byPath);
            if (abs instanceof TFile && isHtmlExtension(abs.extension)) {
                return abs;
            }
        }
        const base = normalized.includes('/')
            ? normalized.slice(normalized.lastIndexOf('/') + 1)
            : normalized;
        const baseLower = base.toLowerCase();
        const hits = this.app.vault
            .getFiles()
            .filter((f) => f.name.toLowerCase() === baseLower && isHtmlExtension(f.extension));
        if (normalized.includes('/')) {
            const pathLower = normalized.toLowerCase();
            return (
                hits.find(
                    (f) =>
                        f.path.toLowerCase() === pathLower ||
                        f.path.toLowerCase().endsWith('/' + pathLower),
                ) ?? null
            );
        }
        return hits[0] ?? null;
    }

    /** 静态页的目录 URL，供 `<base href>` 解析同目录资源 */
    onlineVaultBaseHref(filePath: string): string {
        const slash = filePath.lastIndexOf('/');
        const dir = slash >= 0 ? filePath.slice(0, slash) : '';
        const encoded = dir
            ? dir
                  .split('/')
                  .map((seg) => encodeURIComponent(seg))
                  .join('/') + '/'
            : '';
        return '/online/vault/' + encoded;
    }

    async handleOnlineVaultStatic(res: HttpRes, parsedUrl: ParsedReqUrl) {
        try {
            const rel = vaultPathFromOnlineStatic(parsedUrl.pathname);
            if (!rel) {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Not found');
                return;
            }
            const abs = this.app.vault.getAbstractFileByPath(rel);
            if (!(abs instanceof TFile)) {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Not found');
                return;
            }
            await this.sendVaultFile(res, abs, 'no-cache');
        } catch (error: unknown) {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(errorMessage(error) || 'read failed');
        }
    }

    private onlineMediaMime(extension: string): string {
        let ext = (extension || '').toLowerCase().replace(/^\./, '');
        let map: Record<string, string> = {
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            gif: 'image/gif',
            webp: 'image/webp',
            svg: 'image/svg+xml',
            ico: 'image/x-icon',
            bmp: 'image/bmp',
            avif: 'image/avif',
            mp4: 'video/mp4',
            webm: 'video/webm',
            ogv: 'video/ogg',
            mp3: 'audio/mpeg',
            wav: 'audio/wav',
            ogg: 'audio/ogg',
            pdf: 'application/pdf',
            woff: 'font/woff',
            woff2: 'font/woff2',
            ttf: 'font/ttf',
            otf: 'font/otf',
            html: 'text/html; charset=utf-8',
            htm: 'text/html; charset=utf-8',
            css: 'text/css; charset=utf-8',
            js: 'text/javascript; charset=utf-8',
            mjs: 'text/javascript; charset=utf-8',
            json: 'application/json; charset=utf-8',
            map: 'application/json; charset=utf-8',
            txt: 'text/plain; charset=utf-8',
            xml: 'application/xml; charset=utf-8',
            wasm: 'application/wasm',
            webmanifest: 'application/manifest+json',
        };
        return map[ext] || 'application/octet-stream';
    }

    private async sendVaultFile(res: HttpRes, file: TFile, cacheControl: string) {
        let raw = await this.app.vault.readBinary(file);
        let body =
            raw instanceof ArrayBuffer
                ? Buffer.from(raw)
                : Buffer.isBuffer(raw)
                  ? raw
                  : Buffer.from(raw as Uint8Array);
        res.writeHead(200, {
            'Content-Type': this.onlineMediaMime(file.extension),
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': cacheControl,
            'X-Content-Type-Options': 'nosniff',
        });
        res.end(body);
    }

    async handleOnlineMedia(req: HttpReq, res: HttpRes, parsedUrl: ParsedReqUrl) {
        try {
            let pathParam = parsedUrl.query && (parsedUrl.query.path as string | undefined);
            let p = this.normalizeOnlineVaultPath(pathParam);
            if (!p) {
                res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Bad path');
                return;
            }
            let abs = this.app.vault.getAbstractFileByPath(p);
            if (!abs || !(abs instanceof TFile)) {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Not found');
                return;
            }
            let raw = await this.app.vault.readBinary(abs);
            let body =
                raw instanceof ArrayBuffer
                    ? Buffer.from(raw)
                    : Buffer.isBuffer(raw)
                      ? raw
                      : Buffer.from(raw as Uint8Array);
            res.writeHead(200, {
                'Content-Type': this.onlineMediaMime(abs.extension),
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=3600',
            });
            res.end(body);
        } catch (error: unknown) {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(errorMessage(error) || 'read failed');
        }
    }
}

export function queryString(parsed: ParsedReqUrl, key: string): string {
    const value = parsed.query ? parsed.query[key] : undefined;
    if (typeof value === 'string') {
        return value;
    }
    if (Array.isArray(value) && typeof value[0] === 'string') {
        return value[0];
    }
    return '';
}

/** 页面里没有 `<base>` 时插入，让相对路径落到该 HTML 所在目录。 */
export function injectHtmlBase(html: string, baseHref: string): string {
    if (/<base\b/i.test(html)) {
        return html;
    }
    const tag = '<base href="' + baseHref.replace(/"/g, '%22') + '">';
    if (/<head\b[^>]*>/i.test(html)) {
        return html.replace(/<head\b[^>]*>/i, (open) => open + tag);
    }
    if (/<html\b[^>]*>/i.test(html)) {
        return html.replace(/<html\b[^>]*>/i, (open) => open + '<head>' + tag + '</head>');
    }
    return '<head>' + tag + '</head>' + html;
}

function isHtmlExtension(ext: string): boolean {
    const e = ext.toLowerCase();
    return e === 'html' || e === 'htm';
}

function htmlLookupName(raw: string): string | null {
    let name = raw.trim();
    if (!name) {
        return null;
    }
    name = name.replace(/^!?\[\[/, '').replace(/\]\]\s*$/, '').trim();
    const pipe = name.indexOf('|');
    if (pipe >= 0) {
        name = name.slice(0, pipe).trim();
    }
    const withFragment = /^(.*\.html?)(#[^#]*)?$/i.exec(name);
    if (!withFragment) {
        return null;
    }
    const fileName = withFragment[1].trim();
    return fileName || null;
}

function vaultPathFromOnlineStatic(pathname: string | null): string | null {
    const prefix = '/online/vault/';
    if (!pathname || !pathname.startsWith(prefix)) {
        return null;
    }
    const rest = pathname.slice(prefix.length);
    if (!rest || rest.endsWith('/')) {
        return null;
    }
    const parts: string[] = [];
    for (const seg of rest.split('/')) {
        if (!seg || seg === '.' || seg === '..') {
            return null;
        }
        let decoded: string;
        try {
            decoded = decodeURIComponent(seg);
        } catch {
            return null;
        }
        if (
            !decoded ||
            decoded === '.' ||
            decoded === '..' ||
            decoded.includes('/') ||
            decoded.includes('\\') ||
            decoded.includes('\0')
        ) {
            return null;
        }
        parts.push(decoded);
    }
    return parts.join('/');
}
