import { App, TFile, normalizePath } from 'obsidian';

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
        let adapter = this.app.vault.adapter as any;
        let getFullPath = adapter.getFullPath as undefined | ((p: string) => string);
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
        let wrap = document.createElement('div');
        wrap.innerHTML = html;
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
        };
        return map[ext] || 'application/octet-stream';
    }

    async handleOnlineMedia(req: any, res: any, parsedUrl: any) {
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
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(error.message || 'read failed');
        }
    }
}
