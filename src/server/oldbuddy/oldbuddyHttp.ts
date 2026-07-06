import {
    jsonResponse,
    parseMultipartForm,
    parseUrlEncoded,
    readHttpBody,
    readHttpBodyBuffer,
    sendLocalFile,
} from '../httpUtil';
import { OLDBUDDY_PAGE_HTML } from '../oldbuddyPageHtml';
import { OldBuddyStore, inferOldBuddyMessageType } from './oldbuddyStore';

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
            await this.serveUpload(req, res, fname);
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
        if (sub === 'api/reference' && req.method === 'GET') {
            const target = parsedUrl.query?.target as string | undefined;
            const query = parsedUrl.query?.query as string | undefined;
            jsonResponse(res, 200, {
                references: await this.store.loadReferences(target, query),
            });
            return true;
        }
        if (sub === 'api/avatars' && req.method === 'GET') {
            const target = parsedUrl.query?.target as string | undefined;
            jsonResponse(res, 200, { avatars: await this.store.loadAvatars(target) });
            return true;
        }
        if (sub === 'api/vault_asset' && req.method === 'GET') {
            const rel = parsedUrl.query?.path as string | undefined;
            await this.serveVaultAsset(res, rel || '');
            return true;
        }
        if (sub === 'api/messages' && req.method === 'GET') {
            const limit = Math.min(100, Math.max(1, parseInt(String(parsedUrl.query?.limit || '10'), 10) || 10));
            const before = parsedUrl.query?.before as string | undefined;
            const target = parsedUrl.query?.target as string | undefined;
            jsonResponse(res, 200, await this.store.listMessages(limit, before || null, target || null));
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
        if (sub === 'api/message/video' && req.method === 'POST') {
            await this.handleUploadMessage(req, res, 'video');
            return true;
        }
        if (sub === 'api/message/file' && req.method === 'POST') {
            await this.handleUploadMessage(req, res, 'file');
            return true;
        }
        if (sub === 'push_message' && req.method === 'POST') {
            await this.handlePushMessage(req, res);
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

    private async handleUploadMessage(req: any, res: any, type: 'image' | 'audio' | 'video' | 'file') {
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
            const messageType = inferOldBuddyMessageType(type, file.mime || '', file.filename || '');
            const message = await this.store.addFileMessage({
                type: messageType,
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

    private async handlePushMessage(req: any, res: any) {
        try {
            const body = await readHttpBody(req);
            const ct = String(req.headers['content-type'] || '');
            let fields: Record<string, unknown>;
            if (ct.includes('application/json')) {
                fields = JSON.parse(body || '{}');
                if (fields.message && typeof fields.message === 'object') {
                    fields = fields.message as Record<string, unknown>;
                }
            } else {
                fields = parseUrlEncoded(body) as Record<string, unknown>;
            }
            const message = await this.store.pushExternalMessage({
                content: String(fields.content || ''),
                sender: fields.sender != null ? String(fields.sender) : undefined,
                target: fields.target != null ? String(fields.target) : undefined,
                type: fields.type != null ? (String(fields.type) as 'text' | 'image' | 'audio' | 'video' | 'file') : undefined,
                extra_text: fields.extra_text != null ? String(fields.extra_text) : undefined,
                file_name: fields.file_name != null ? String(fields.file_name) : undefined,
                file_size: fields.file_size != null ? Number(fields.file_size) : undefined,
                card: fields.card as boolean | string | number | undefined,
                id: fields.id != null ? String(fields.id) : undefined,
                timestamp: fields.timestamp != null ? String(fields.timestamp) : undefined,
                skip_reply: fields.skip_reply as boolean | string | undefined,
                quick_cmd_id: fields.quick_cmd_id != null ? String(fields.quick_cmd_id) : undefined,
            });
            jsonResponse(res, 200, { ok: true, message });
        } catch (e: any) {
            const msg = e?.message || 'push failed';
            const status = msg === 'content required' || msg === 'invalid type' ? 400 : 500;
            jsonResponse(res, status, { ok: false, error: msg });
        }
    }

    private async serveVaultAsset(res: any, relPath: string) {
        const file = await this.store.readVaultAsset(relPath);
        if (!file) {
            res.writeHead(404);
            res.end('Not Found');
            return;
        }
        res.writeHead(200, { 'Content-Type': file.mime, 'Cache-Control': 'public, max-age=3600' });
        res.end(file.data);
    }

    private serveUpload(req: any, res: any, fname: string) {
        const meta = this.store.serveUploadMeta(fname);
        if (!meta) {
            res.writeHead(404);
            res.end('Not Found');
            return;
        }
        sendLocalFile(req, res, meta.abs, {
            mime: meta.mime,
            size: meta.size,
            mtime: meta.mtime,
        });
    }
}
