import {
    jsonResponse,
    parseMultipartForm,
    parseUrlEncoded,
    readHttpBody,
    readHttpBodyBuffer,
} from '../httpUtil';
import { OLDBUDDY_PAGE_HTML } from '../oldbuddyPageHtml';
import { OldBuddyStore } from './oldbuddyStore';

const BASE = '/oldbuddy';

/** /oldbuddy 聊天页与 API（页面 HTML 内嵌于 main.js，同 onlineHttp） */
export class OldBuddyHttpHandlers {
    constructor(private store: OldBuddyStore) {}

    matches(pathname: string | null | undefined): boolean {
        if (!pathname) return false;
        return pathname === BASE || pathname.startsWith(`${BASE}/`);
    }

    handleUpgrade(req: any, socket: any, head: Buffer) {
        this.store.getWebSocketHub().handleUpgrade(req, socket, head);
    }

    isWebSocketPath(pathname: string | null | undefined): boolean {
        return pathname === `${BASE}/ws`;
    }

    async handle(req: any, res: any, parsedUrl: any): Promise<boolean> {
        const pathname = parsedUrl.pathname || '';
        if (!this.matches(pathname)) return false;

        const sub = pathname.slice(BASE.length).replace(/^\//, '') || '';

        if ((sub === '' || sub === 'index.html') && req.method === 'GET') {
            this.handleOldBuddyPage(req, res);
            return true;
        }
        if (sub.startsWith('uploads/') && req.method === 'GET') {
            const fname = decodeURIComponent(sub.slice('uploads/'.length));
            await this.serveUpload(res, fname);
            return true;
        }

        if (sub === 'api/targets' && req.method === 'GET') {
            jsonResponse(res, 200, await this.store.loadTargetsConfig());
            return true;
        }
        if (sub === 'api/quick_commands' && req.method === 'GET') {
            const target = parsedUrl.query?.target as string | undefined;
            jsonResponse(res, 200, { commands: await this.store.loadQuickCommands(target) });
            return true;
        }
        if (sub === 'api/messages' && req.method === 'GET') {
            const limit = Math.min(100, Math.max(1, parseInt(String(parsedUrl.query?.limit || '10'), 10) || 10));
            const before = parsedUrl.query?.before as string | undefined;
            jsonResponse(res, 200, this.store.listMessages(limit, before || null));
            return true;
        }
        if (sub === 'api/message/text' && req.method === 'POST') {
            await this.handleTextMessage(req, res);
            return true;
        }
        if (sub === 'api/message/image' && req.method === 'POST') {
            await this.handleUploadMessage(req, res, 'image');
            return true;
        }
        if (sub === 'api/message/audio' && req.method === 'POST') {
            await this.handleUploadMessage(req, res, 'audio');
            return true;
        }
        if (sub === 'api/message/file' && req.method === 'POST') {
            await this.handleUploadMessage(req, res, 'file');
            return true;
        }

        jsonResponse(res, 404, { error: 'Not Found', path: pathname });
        return true;
    }

    handleOldBuddyPage(_req: any, res: any) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(OLDBUDDY_PAGE_HTML);
    }

    private async handleTextMessage(req: any, res: any) {
        try {
            const body = await readHttpBody(req);
            const ct = String(req.headers['content-type'] || '');
            const fields = ct.includes('application/json')
                ? JSON.parse(body || '{}')
                : parseUrlEncoded(body);
            const content = String(fields.content || '').trim();
            if (!content) {
                jsonResponse(res, 400, { error: 'content required' });
                return;
            }
            const message = await this.store.addTextMessage({
                content,
                sender: fields.sender || 'user',
                target: fields.target || 'local',
                extra_text: fields.extra_text,
                quick_cmd_id: fields.quick_cmd_id,
            });
            jsonResponse(res, 200, { message });
        } catch (e: any) {
            jsonResponse(res, 500, { error: e.message || 'send failed' });
        }
    }

    private async handleUploadMessage(req: any, res: any, type: 'image' | 'audio' | 'file') {
        try {
            const ct = String(req.headers['content-type'] || '');
            if (!ct.includes('multipart/form-data')) {
                jsonResponse(res, 400, { error: 'multipart/form-data required' });
                return;
            }
            const body = await readHttpBodyBuffer(req);
            const { fields, files } = parseMultipartForm(body, ct);
            const file = files.find((f) => f.name === 'file') || files[0];
            if (!file || !file.data?.length) {
                jsonResponse(res, 400, { error: 'file required' });
                return;
            }
            const saved = this.store.saveUpload(file.data, file.filename || 'upload', file.mime || 'application/octet-stream');
            const message = await this.store.addFileMessage({
                type,
                url: saved.url,
                sender: fields.sender || 'user',
                target: fields.target || 'local',
                extra_text: fields.extra_text,
                file_name: file.filename || undefined,
                file_size: file.data.length,
            });
            jsonResponse(res, 200, { message });
        } catch (e: any) {
            jsonResponse(res, 500, { error: e.message || 'upload failed' });
        }
    }

    private async serveUpload(res: any, fname: string) {
        const file = this.store.serveUploadFile(fname);
        if (!file) {
            res.writeHead(404);
            res.end('Not Found');
            return;
        }
        res.writeHead(200, { 'Content-Type': file.mime, 'Cache-Control': 'public, max-age=86400' });
        res.end(file.data);
    }
}
