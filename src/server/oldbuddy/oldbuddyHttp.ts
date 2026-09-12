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
import { parseJiujiuPacket, JiujiuPushError } from './jiujiu';
import { normalizeAttachments } from './types';
import type { HttpReq, HttpRes, ParsedReqUrl } from '../../http-types';
import { parseRequestUrl } from '../../http-types';
import { errorMessage } from '../../ts-helpers';
import type { OldBuddyWsClient } from './oldbuddyWebSocket';

type Socket = OldBuddyWsClient['socket'];

const BASE = '/oldbuddy';

function headerVal(req: HttpReq, name: string): string {
    const v = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
    return Array.isArray(v) ? String(v[0] || '') : String(v || '');
}

function isJiujiuWsPath(pathname: string | null | undefined): boolean {
    const p = pathname || '';
    return (
        p === '/oldbuddy/jiujiu' ||
        p === '/jiujiu' ||
        p === '/oldbuddy' ||
        p === '/' ||
        p === '/ws'
    );
}

function isJiujiuPushPath(pathname: string | null | undefined): boolean {
    const p = pathname || '';
    return p === '/push' || p === '/jiujiu/push' || p === `${BASE}/jiujiu/push`;
}

function isJiujiuCardResultPath(pathname: string | null | undefined): boolean {
    const p = pathname || '';
    return p === '/card-result' || p === '/jiujiu/card-result' || p === `${BASE}/jiujiu/card-result`;
}

/** /oldbuddy 聊天页与 API（页面 HTML 内嵌于 main.js，同 onlineHttp） */
export class OldBuddyHttpHandlers {
    constructor(private store: OldBuddyStore) {}

    matches(pathname: string | null | undefined): boolean {
        if (!pathname) return false;
        if (pathname === '/jiujiu' || pathname === '/ws' || isJiujiuPushPath(pathname) || isJiujiuCardResultPath(pathname)) return true;
        return pathname === BASE || pathname.startsWith(`${BASE}/`);
    }

    handleUpgrade(req: HttpReq, socket: Socket, head: Buffer) {
        const parsed = parseRequestUrl(req.url || '');
        const pathname = parsed.pathname || '';
        const kind = pathname === `${BASE}/ws` ? 'web' : 'jiujiu';
        const target = String(parsed.query?.target || '').trim();
        const senderId = headerVal(req, 'x-sender-id');
        const q = parsed.query || {};
        const friendName = String(q.friendName || q.friend || q.name || headerVal(req, 'x-friend-name') || '').trim();
        const friendId =
            String(
                q.friendId || headerVal(req, 'x-friend-id') || headerVal(req, 'x-site-id') || '',
            ).trim() || target;
        this.store.getWebSocketHub().handleUpgrade(req, socket, head, {
            kind,
            target: target || undefined,
            senderId: senderId || undefined,
            friendName: friendName || undefined,
            friendId: friendId || undefined,
        });
    }

    isWebSocketPath(pathname: string | null | undefined): boolean {
        return pathname === `${BASE}/ws` || isJiujiuWsPath(pathname);
    }

    async handle(req: HttpReq, res: HttpRes, parsedUrl: ParsedReqUrl): Promise<boolean> {
        const pathname = parsedUrl.pathname || '';
        if (!this.matches(pathname)) return false;

        if (isJiujiuPushPath(pathname) && req.method === 'POST') {
            await this.handleJiujiuPush(req, res);
            return true;
        }
        if (isJiujiuPushPath(pathname) && req.method === 'GET') {
            jsonResponse(res, 200, {
                ok: true,
                protocol: 'jiujiu',
                clients: this.store.getWebSocketHub().jiujiuCount(),
                friends: this.store.getWebSocketHub().listJiujiuFriends(),
                cardResult: '/card-result',
            });
            return true;
        }
        if (isJiujiuCardResultPath(pathname) && req.method === 'POST') {
            await this.handleJiujiuCardResult(req, res);
            return true;
        }
        if (isJiujiuCardResultPath(pathname) && req.method === 'GET') {
            jsonResponse(res, 200, {
                ok: true,
                results: this.store.listCardResults(),
            });
            return true;
        }
        if (
            (pathname === '/jiujiu' || pathname === `${BASE}/jiujiu` || pathname === '/ws') &&
            req.method === 'GET'
        ) {
            jsonResponse(res, 200, {
                ok: true,
                protocol: 'jiujiu',
                ws: '/oldbuddy/jiujiu',
                push: '/push',
                cardResult: '/card-result',
            });
            return true;
        }

        if (!pathname.startsWith(`${BASE}/`) && pathname !== BASE) {
            jsonResponse(res, 404, { error: 'Not Found', path: pathname });
            return true;
        }

        const sub = pathname.slice(BASE.length).replace(/^\//, '') || '';

        if ((sub === '' || sub === 'index.html') && req.method === 'GET') {
            this.handleOldBuddyPage(req, res);
            return true;
        }
        if (sub.startsWith('uploads/') && req.method === 'GET') {
            const fname = decodeURIComponent(sub.slice('uploads/'.length));
            this.serveUpload(req, res, fname);
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
        if (sub === 'api/tags' && req.method === 'GET') {
            const target = parsedUrl.query?.target as string | undefined;
            const query = parsedUrl.query?.query as string | undefined;
            jsonResponse(res, 200, {
                tags: await this.store.loadTags(target, query),
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

    private async handleJiujiuPush(req: HttpReq, res: HttpRes) {
        try {
            const body = await readHttpBody(req);
            const ct = String(req.headers['content-type'] || '');
            let fields: Record<string, unknown> = {};
            if (ct.includes('application/json') || String(body || '').trim().startsWith('{')) {
                fields = JSON.parse(body || '{}');
            } else {
                fields = parseUrlEncoded(body);
            }
            const packet = parseJiujiuPacket(JSON.stringify(fields)) || { content: String(fields.content || '') };
            const result = await this.store.handleJiujiuHttpPush(packet);
            jsonResponse(res, 200, result);
        } catch (e: unknown) {
            if (e instanceof JiujiuPushError) {
                jsonResponse(res, e.status, {
                    ok: false,
                    error: e.message,
                    friends: e.friends,
                });
                return;
            }
            const msg = errorMessage(e) || 'push failed';
            const status = msg === 'content required' || msg === 'attachment too large' ? 400 : 500;
            jsonResponse(res, status, { ok: false, error: msg });
        }
    }

    private async handleJiujiuCardResult(req: HttpReq, res: HttpRes) {
        try {
            const body = await readHttpBody(req);
            const fields = JSON.parse(body || '{}') as unknown;
            if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
                jsonResponse(res, 400, { ok: false, error: 'payload must be a JSON object' });
                return;
            }
            this.store.rememberCardResult(fields as Record<string, unknown>);
            jsonResponse(res, 200, { ok: true, stored: this.store.listCardResults().length });
        } catch (e: unknown) {
            jsonResponse(res, 400, { ok: false, error: errorMessage(e) || 'invalid json' });
        }
    }

    handleOldBuddyPage(_req: HttpReq, res: HttpRes) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(OLDBUDDY_PAGE_HTML);
    }

    private async handleTextMessage(req: HttpReq, res: HttpRes) {
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
        } catch (e: unknown) {
            jsonResponse(res, 500, { error: errorMessage(e) || 'send failed' });
        }
    }

    private async handleUploadMessage(req: HttpReq, res: HttpRes, type: 'image' | 'audio' | 'video' | 'file') {
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
                mime: file.mime || undefined,
            });
            jsonResponse(res, 200, { message });
        } catch (e: unknown) {
            jsonResponse(res, 500, { error: errorMessage(e) || 'upload failed' });
        }
    }

    private async handlePushMessage(req: HttpReq, res: HttpRes) {
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
                fields = parseUrlEncoded(body);
            }
            const message = await this.store.pushExternalMessage({
                content: String(fields.content || ''),
                sender: fields.sender != null ? String(fields.sender) : undefined,
                target: fields.target != null ? String(fields.target) : undefined,
                type: fields.type != null ? String(fields.type) : undefined,
                extra_text: fields.extra_text != null ? String(fields.extra_text) : undefined,
                file_name: fields.file_name != null ? String(fields.file_name) : undefined,
                file_size: fields.file_size != null ? Number(fields.file_size) : undefined,
                card: fields.card as boolean | string | number | undefined,
                id: fields.id != null ? String(fields.id) : undefined,
                timestamp: fields.timestamp != null ? String(fields.timestamp) : undefined,
                skip_reply: fields.skip_reply as boolean | string | undefined,
                quick_cmd_id: fields.quick_cmd_id != null ? String(fields.quick_cmd_id) : undefined,
                senderName: fields.senderName != null ? String(fields.senderName) : undefined,
                attachments: Array.isArray(fields.attachments)
                    ? normalizeAttachments(fields.attachments)
                    : undefined,
            });
            jsonResponse(res, 200, { ok: true, message });
        } catch (e: unknown) {
            const msg = errorMessage(e) || 'push failed';
            const status = msg === 'content required' || msg === 'invalid type' ? 400 : 500;
            jsonResponse(res, status, { ok: false, error: msg });
        }
    }

    private async serveVaultAsset(res: HttpRes, relPath: string) {
        const file = await this.store.readVaultAsset(relPath);
        if (!file) {
            res.writeHead(404);
            res.end('Not Found');
            return;
        }
        res.writeHead(200, { 'Content-Type': file.mime, 'Cache-Control': 'public, max-age=3600' });
        res.end(file.data);
    }

    private serveUpload(req: HttpReq, res: HttpRes, fname: string) {
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
