import { parseYaml } from 'obsidian';
import type { OldBuddyAttachment, OldBuddyMessage, OldBuddyMessageType } from './types';
import { attachmentKindFromMime, asProtocolConfig, isEnvelopeType, isJiujiuCardStoredType, isUserSender, normalizeAttachments } from './types';
import { isRecord } from '../../ts-helpers';

export const JIUJIU_MAX_ATTACH_BYTES = 6 * 1024 * 1024;

export type JiujiuAttachKind = 'image' | 'audio' | 'file';

export interface JiujiuAttachment {
    name?: string;
    mime?: string;
    kind?: string;
    data?: string;
    url?: string;
    size?: number;
    durationMs?: number;
}

export type JiujiuAttachNode = JiujiuAttachment & {
    type?: string;
    content?: string;
    title?: string;
    attachments?: JiujiuAttachNode[];
    urls?: unknown[];
    tabs?: unknown[];
    card?: Record<string, unknown>;
};

export interface JiujiuPacket {
    type?: string;
    action?: string;
    content?: string;
    msgId?: string;
    timestamp?: number | string;
    senderId?: string;
    senderName?: string;
    target?: string;
    friendName?: string;
    friend?: string;
    friendId?: string;
    sender?: string;
    name?: string;
    durationMs?: number;
    hour?: number;
    minute?: number;
    direct?: boolean | string;
    attachments?: JiujiuAttachNode[];
    replyTo?: string;
    result?: Record<string, unknown>;
    card?: Record<string, unknown>;
    actions?: unknown[];
    fields?: unknown[];
    title?: string;
    description?: string;
    reply?: string;
    callbackUrl?: string;
    urls?: unknown[];
    tabs?: unknown[];
    layout?: string;
    [key: string]: unknown;
}

const INTERACTIVE_TYPES = new Set(['interactive', 'card', 'form', 'ui', 'interactive_card']);
const WEBSITE_TYPES = new Set(['website', 'web', 'lookup', 'sites']);
const SLIDER_TYPES = new Set(['slider', 'carousel', 'slideshow']);
const HTML_TYPES = new Set(['html', 'html_card', 'richhtml']);
const RESULT_TYPES = new Set(['interactive_result', 'card_result', 'form_result']);
const CONSUMED_KEYS = new Set([
    'type', 'content', 'msgId', 'id', 'timestamp', 'attachments',
    'action', 'durationMs', 'hour', 'minute', 'direct', 'name',
    'senderId', 'senderName', 'sender', 'friendId', 'friendName', 'friend',
    'target', 'to', 'dest', 'room', 'replyTo', 'inReplyTo', 'result',
    'card', 'actions', 'fields', 'title', 'description', 'desc',
    'reply', 'replyMode', 'callbackUrl', 'callback', 'replyUrl',
    'urls', 'tabs', 'layout',
]);

function asStr(...values: unknown[]): string {
    for (const value of values) {
        if (value == null) continue;
        const text = String(value).trim();
        if (text) return text;
    }
    return '';
}

function asDict(value: unknown): Record<string, unknown> | undefined {
    return isRecord(value) ? value : undefined;
}

function asList(value: unknown): unknown[] {
    return Array.isArray(value) ? [...value] : [];
}

function looksLikeCard(value: unknown): value is Record<string, unknown> {
    if (!isRecord(value)) return false;
    if (hasJiujiuWebsitePayload(value)) return false;
    return !!(value.card || value.actions || value.fields || value.title || value.description);
}

export function hasJiujiuWebsitePayload(data: Record<string, unknown> | JiujiuPacket): boolean {
    return Array.isArray(data.urls) || Array.isArray(data.tabs);
}

export function isJiujiuWebsiteType(msgType: string): boolean {
    return WEBSITE_TYPES.has(msgType.trim().toLowerCase());
}

export function isJiujiuWebsite(packet: JiujiuPacket): boolean {
    return isJiujiuWebsiteType(String(packet.type || '')) || hasJiujiuWebsitePayload(packet);
}

export function hasJiujiuCardPayload(data: Record<string, unknown> | JiujiuPacket): boolean {
    if (data.card || data.actions || data.fields) return true;
    return looksLikeCard(data.content);
}

export function isJiujiuInteractiveType(msgType: string): boolean {
    return INTERACTIVE_TYPES.has(msgType.trim().toLowerCase());
}

export function isJiujiuResultType(msgType: string): boolean {
    return RESULT_TYPES.has(msgType.trim().toLowerCase());
}

export function isJiujiuInteractive(packet: JiujiuPacket): boolean {
    return isJiujiuInteractiveType(String(packet.type || ''))
        || !!(packet.card || (packet.actions && packet.actions.length) || (packet.fields && packet.fields.length));
}

export function isJiujiuResult(packet: JiujiuPacket): boolean {
    return isJiujiuResultType(String(packet.type || ''));
}

export function isJiujiuSliderType(msgType: string): boolean {
    return SLIDER_TYPES.has(msgType.trim().toLowerCase());
}

export function isJiujiuHtmlType(msgType: string): boolean {
    return HTML_TYPES.has(msgType.trim().toLowerCase());
}

export function isNestedJiujiuMessage(att: unknown): boolean {
    if (!isRecord(att)) return false;
    const t = String(att.type || '').trim().toLowerCase();
    if (t && t !== 'image' && t !== 'audio' && t !== 'file' && t !== 'video') return true;
    if (isRecord(att.card) || Array.isArray(att.urls) || Array.isArray(att.tabs)) return true;
    return Array.isArray(att.attachments) && (att.content != null || att.title != null);
}

/** 非信封 type（互动卡、网站卡、轮播、HTML 及以后的新卡片）用啾啾 type + config。 */
export function isJiujiuJsonStored(packet: JiujiuPacket): boolean {
    if (isJiujiuInteractive(packet) || isJiujiuWebsite(packet) || isJiujiuResult(packet)) return true;
    if (isJiujiuActionPacket(packet)) return false;
    const t = String(packet.type || '').trim().toLowerCase();
    if (!t || isEnvelopeType(t)) return false;
    return true;
}

export function jiujiuBodyWithoutType(packet: JiujiuPacket): Record<string, unknown> {
    const persist = stripJiujiuAttachmentData({ ...packet }) as Record<string, unknown>;
    delete persist.type;
    for (const key of Object.keys(persist)) {
        const value = persist[key];
        if (value === undefined || value === '') delete persist[key];
    }
    return persist;
}

function normalizeContent(data: Record<string, unknown>): { content: string; card?: Record<string, unknown> } {
    const card = asDict(data.card);
    const content = data.content;
    if (isRecord(content)) {
        if (!card && looksLikeCard(content)) {
            return {
                content: asStr(content.content, content.description, content.title),
                card: content,
            };
        }
        return { content: JSON.stringify(content), card };
    }
    if (content == null) return { content: '', card };
    if (typeof content !== 'string') return { content: String(content), card };
    return { content, card };
}

/** 对齐 App README / Python Envelope：未知键进 extra，往返不丢。 */
export function normalizeJiujiuPacket(raw: Record<string, unknown> | JiujiuPacket): JiujiuPacket {
    const data = raw as Record<string, unknown>;
    const { content, card } = normalizeContent(data);
    let rawType = asStr(data.type);
    if (!rawType && hasJiujiuWebsitePayload(data)) rawType = 'website';
    if (!rawType && hasJiujiuCardPayload(data)) rawType = 'interactive';
    if (!rawType) rawType = 'message';

    const extra: Record<string, unknown> = {};
    for (const key of Object.keys(data)) {
        if (!CONSUMED_KEYS.has(key)) extra[key] = data[key];
    }

    const packet: JiujiuPacket = {
        type: rawType,
        content,
        msgId: asStr(data.msgId, data.id) || undefined,
        timestamp: (data.timestamp as number | string | undefined) ?? Date.now(),
        ...extra,
    };
    const action = asStr(data.action);
    if (action) packet.action = action;
    if (Array.isArray(data.attachments)) packet.attachments = data.attachments as JiujiuAttachment[];
    if (data.durationMs != null && Number.isFinite(Number(data.durationMs))) {
        packet.durationMs = Number(data.durationMs);
    }
    if (data.hour != null && Number.isFinite(Number(data.hour))) packet.hour = Number(data.hour);
    if (data.minute != null && Number.isFinite(Number(data.minute))) packet.minute = Number(data.minute);
    if (data.direct === true || data.direct === 'true' || data.direct === 1) packet.direct = true;
    const name = asStr(data.name);
    if (name) packet.name = name;
    const senderId = asStr(data.senderId, data.sender);
    if (senderId) packet.senderId = senderId;
    const senderName = asStr(data.senderName);
    if (senderName) packet.senderName = senderName;
    const friendId = asStr(data.friendId);
    if (friendId) packet.friendId = friendId;
    const friendName = asStr(data.friendName, data.friend);
    if (friendName) packet.friendName = friendName;
    const target = asStr(data.target, data.to, data.dest, data.room);
    if (target) packet.target = target;
    const replyTo = asStr(data.replyTo, data.inReplyTo);
    if (replyTo) packet.replyTo = replyTo;
    const result = asDict(data.result);
    if (result) packet.result = result;
    if (card) packet.card = card;
    const actions = asList(data.actions);
    if (actions.length) packet.actions = actions;
    const fields = asList(data.fields);
    if (fields.length) packet.fields = fields;
    const title = asStr(data.title);
    if (title) packet.title = title;
    const description = asStr(data.description, data.desc);
    if (description) packet.description = description;
    const reply = asStr(data.reply, data.replyMode);
    if (reply) packet.reply = reply;
    const callbackUrl = asStr(data.callbackUrl, data.callback, data.replyUrl);
    if (callbackUrl) packet.callbackUrl = callbackUrl;
    const urls = asList(data.urls);
    if (urls.length) packet.urls = urls;
    const tabs = asList(data.tabs);
    if (tabs.length) packet.tabs = tabs;
    const layout = asStr(data.layout).toLowerCase();
    if (layout === 'vertical' || layout === 'horizontal') packet.layout = layout;
    return packet;
}

/** 出站 JSON：有 nested card 时根上不再重复 fields/title/description。values 保持原类型。 */
export function packetToOutgoing(packet: JiujiuPacket): JiujiuPacket {
    const out: JiujiuPacket = {
        type: packet.type || 'message',
        content: String(packet.content ?? ''),
        msgId: String(packet.msgId || ''),
        timestamp: packet.timestamp ?? Date.now(),
    };
    if (packet.action) out.action = packet.action;
    if (packet.durationMs) out.durationMs = packet.durationMs;
    if (packet.hour != null) out.hour = packet.hour;
    if (packet.minute != null) out.minute = packet.minute;
    if (packet.direct === true || packet.direct === 'true') out.direct = true;
    if (packet.name) out.name = packet.name;
    if (packet.senderId) out.senderId = String(packet.senderId);
    if (packet.senderName) out.senderName = String(packet.senderName);
    if (packet.friendId) out.friendId = String(packet.friendId);
    if (packet.friendName) out.friendName = String(packet.friendName);
    if (packet.target) out.target = String(packet.target);
    if (packet.replyTo) out.replyTo = packet.replyTo;
    if (packet.result) out.result = packet.result;
    if (packet.card) out.card = packet.card;
    if (packet.actions && packet.actions.length) out.actions = packet.actions;
    if (packet.fields && packet.fields.length && !packet.card) out.fields = packet.fields;
    if (packet.title && !packet.card) out.title = packet.title;
    if (packet.description && !packet.card) out.description = packet.description;
    if (packet.reply) out.reply = packet.reply;
    if (packet.callbackUrl) out.callbackUrl = packet.callbackUrl;
    if (packet.urls && packet.urls.length) out.urls = packet.urls;
    if (packet.tabs && packet.tabs.length) out.tabs = packet.tabs;
    if (packet.layout) out.layout = packet.layout;
    if (Array.isArray(packet.attachments) && packet.attachments.length) {
        out.attachments = packet.attachments;
    }
    for (const key of Object.keys(packet)) {
        if (CONSUMED_KEYS.has(key) || key in out) continue;
        const value = packet[key];
        if (value !== undefined) out[key] = value;
    }
    return out;
}

export function pickPushFriend(packet: JiujiuPacket): { friendName: string; friendId: string; target: string } {
    const friendName = String(packet.friendName ?? packet.friend ?? '').trim();
    const friendId = String(packet.friendId ?? '').trim();
    const target = String(packet.target ?? '').trim();
    return { friendName, friendId, target };
}

/** 多好友共用同一 WS 时，出站包带上会话路由，App 只写入对得上的那条。欢迎语不要带。 */
export function attachJiujiuSession(
    packet: JiujiuPacket,
    session?: { friendName?: string; friendId?: string; target?: string },
): JiujiuPacket {
    if (!session) return packet;
    const out: JiujiuPacket = { ...packet };
    const friendName = String(session.friendName || '').trim();
    const friendId = String(session.friendId || '').trim();
    const target = String(session.target || '').trim();
    if (friendName) out.friendName = friendName;
    if (friendId) out.friendId = friendId;
    if (target) out.target = target;
    return out;
}

export function pickPushSender(packet: JiujiuPacket): { senderId: string; senderName: string } {
    const senderName = String(packet.senderName ?? '').trim();
    const senderField = String(packet.sender ?? '').trim();
    let senderId = String(packet.senderId ?? '').trim();
    if (!senderId) {
        const candidate = senderField || senderName;
        senderId = isUserSender(candidate) ? candidate : 'buddy';
    }
    return { senderId, senderName: senderName || senderField };
}

export function jiujiuActionName(packet: JiujiuPacket): string {
    const action = String(packet.action || '').toLowerCase();
    if (action === 'player' || action === 'timer' || action === 'alarm') return action;
    const type = String(packet.type || '').toLowerCase();
    if (type === 'player' || type === 'timer' || type === 'alarm') return type;
    return '';
}

export function isJiujiuActionPacket(packet: JiujiuPacket): boolean {
    const type = String(packet.type || '').toLowerCase();
    return type === 'action' || !!jiujiuActionName(packet);
}

export function toJiujiuActionPacket(
    packet: JiujiuPacket,
    extra?: { senderId?: string; senderName?: string; msgId?: string },
): JiujiuPacket {
    const action = jiujiuActionName(packet) || 'player';
    const out: JiujiuPacket = {
        type: 'action',
        action,
        content: String(packet.content || packet.name || ''),
        msgId: String(extra?.msgId || packet.msgId || ''),
        timestamp: Number(packet.timestamp) > 0 ? Number(packet.timestamp) : Date.now(),
    };
    const name = String(packet.name || '').trim();
    if (name) out.name = name;
    if (packet.durationMs != null && Number.isFinite(Number(packet.durationMs))) {
        out.durationMs = Number(packet.durationMs);
    }
    if (packet.hour != null && Number.isFinite(Number(packet.hour))) out.hour = Number(packet.hour);
    if (packet.minute != null && Number.isFinite(Number(packet.minute))) {
        out.minute = Number(packet.minute);
    }
    if (packet.direct === true || packet.direct === 'true') out.direct = true;
    const senderId = extra?.senderId || packet.senderId;
    const senderName = extra?.senderName || packet.senderName;
    if (senderId) out.senderId = String(senderId);
    if (senderName) out.senderName = String(senderName);
    if (Array.isArray(packet.attachments) && packet.attachments.length) {
        out.attachments = packet.attachments;
    }
    return out;
}

export class JiujiuPushError extends Error {
    status: number;
    friends: Array<{ friendName: string; friendId: string; target: string; senderId: string }>;
    constructor(
        status: number,
        message: string,
        friends: Array<{ friendName: string; friendId: string; target: string; senderId: string }> = [],
    ) {
        super(message);
        this.status = status;
        this.friends = friends;
    }
}

export function parseJiujiuPacket(raw: string): JiujiuPacket | null {
    try {
        const v = JSON.parse(raw);
        if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
        return normalizeJiujiuPacket(v as Record<string, unknown>);
    } catch {
        return null;
    }
}

export function jiujiuWelcomePacket(): JiujiuPacket {
    return {
        type: 'welcome',
        content:
            '我是 **OldBuddy（老友）**。直接发文字、图片或语音即可。\n\n' +
            '回复由笔记脚本 `nochain_oldbuddy_reply` 生成。发送 `/help` 可再看本说明。\n\n' +
            '也可发 `/card`、`/yesno`、`/widgets` 试互动卡片，发 `/web` 试网站卡片。第三方 `POST /push` 可推卡片；点选互动卡后 App 会发 `interactive_result`。',
        msgId: 'welcome',
        timestamp: Date.now(),
    };
}

export function isJiujiuHelp(packet: JiujiuPacket): boolean {
    const type = String(packet.type || '').toLowerCase();
    const content = String(packet.content || '').trim();
    return content === '/help' || type === 'help';
}

/** App 侧账号 → OldBuddy user sender（会触发 reply） */
export function jiujiuSenderToOldBuddy(senderId?: string | null): string {
    const s = String(senderId || '').trim();
    if (!s || s === 'user') return 'user';
    if (isUserSender(s)) return s;
    return `user_${s.replace(/[^\w.-]+/g, '_').slice(0, 40)}`;
}

export function tryParseTimestampMs(ts: unknown): number {
    if (typeof ts === 'number' && Number.isFinite(ts) && ts > 0) {
        return ts < 1e12 ? ts * 1000 : ts;
    }
    const s = String(ts ?? '').trim();
    if (!s) return NaN;
    const asNum = Number(s);
    if (Number.isFinite(asNum) && asNum > 0 && !s.includes('T') && !s.includes('-')) {
        return asNum < 1e12 ? asNum * 1000 : asNum;
    }
    const parsed = Date.parse(s);
    return Number.isFinite(parsed) ? parsed : NaN;
}

export function jiujiuTimestampToIso(ts: unknown): string {
    const ms = tryParseTimestampMs(ts);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : new Date().toISOString();
}

export function oldBuddyTimestampToMs(iso: string | undefined): number {
    const t = Date.parse(String(iso || ''));
    return Number.isFinite(t) ? t : Date.now();
}

export function decodeJiujiuBase64(data: string | undefined): Buffer | null {
    const raw = String(data || '').trim();
    if (!raw) return null;
    const b64 = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw;
    try {
        const buf = Buffer.from(b64, 'base64');
        return buf.length ? buf : null;
    } catch {
        return null;
    }
}

export function attachmentKindToJiujiu(kind: string | undefined, mime?: string): JiujiuAttachKind {
    const k = attachmentKindFromMime(mime, '', kind);
    if (k === 'image') return 'image';
    if (k === 'audio') return 'audio';
    return 'file';
}

export function actionMessageToJiujiuPacket(
    msg: OldBuddyMessage,
    files: Array<{ att: OldBuddyAttachment; data: Buffer; mime: string }> = [],
): JiujiuPacket {
    const packet: JiujiuPacket = {
        type: 'action',
        action: String(msg.action || 'player'),
        content: String(msg.content || msg.name || ''),
        msgId: msg.id,
        timestamp: oldBuddyTimestampToMs(msg.timestamp),
    };
    if (msg.name) packet.name = msg.name;
    if (msg.durationMs != null && Number.isFinite(Number(msg.durationMs))) {
        packet.durationMs = Number(msg.durationMs);
    }
    if (msg.hour != null && Number.isFinite(Number(msg.hour))) packet.hour = Number(msg.hour);
    if (msg.minute != null && Number.isFinite(Number(msg.minute))) packet.minute = Number(msg.minute);
    if (msg.direct) packet.direct = true;
    if (msg.sender) packet.senderId = msg.sender;
    if (msg.senderName) packet.senderName = msg.senderName;
    const attachments: JiujiuAttachment[] = [];
    for (const row of files) {
        if (!row.data?.length || row.data.length > JIUJIU_MAX_ATTACH_BYTES) continue;
        attachments.push({
            name: row.att.name || 'file',
            mime: row.mime || row.att.mime || 'application/octet-stream',
            kind: attachmentKindToJiujiu(row.att.kind, row.mime),
            data: row.data.toString('base64'),
            durationMs: row.att.durationMs || 0,
        });
    }
    if (attachments.length) packet.attachments = attachments;
    return packet;
}

/** 从 OldBuddy 卡片记录还原协议包；旧 `type=json` / `message.jiujiu` / attachments 字符串仍可读。 */
export function parseOldBuddyJsonPacket(msg: OldBuddyMessage): JiujiuPacket | null {
    const body = asProtocolConfig(msg.config)
        || (typeof msg.attachments === 'string' ? asProtocolConfig(msg.attachments) : undefined);
    if (isJiujiuCardStoredType(msg.type) || body) {
        const packet: JiujiuPacket = { ...(body || {}) };
        packet.type = msg.type && msg.type !== 'json' ? msg.type : (packet.type || 'interactive');
        const text = String(msg.content || packet.content || packet.title || '').trim();
        if (text) packet.content = text;
        packet.msgId = String(msg.id || packet.msgId || '');
        packet.timestamp = packet.timestamp ?? oldBuddyTimestampToMs(msg.timestamp);
        if (msg.sender) packet.senderId = msg.sender;
        if (msg.senderName && !packet.senderName) packet.senderName = msg.senderName;
        if (msg.target && !packet.target) packet.target = msg.target;
        if (msg.friendName && !packet.friendName) packet.friendName = msg.friendName;
        return packet;
    }
    if (msg.type === 'json') {
        try {
            const value = JSON.parse(String(msg.content || ''));
            if (isRecord(value)) {
                const packet: JiujiuPacket = { ...value };
                packet.msgId = String(msg.id || packet.msgId || '');
                packet.timestamp = packet.timestamp ?? oldBuddyTimestampToMs(msg.timestamp);
                if (msg.sender) packet.senderId = msg.sender;
                if (msg.senderName && !packet.senderName) packet.senderName = msg.senderName;
                if (msg.target && !packet.target) packet.target = msg.target;
                if (msg.friendName && !packet.friendName) packet.friendName = msg.friendName;
                return packet;
            }
        } catch {
            return null;
        }
    }
    return packetFromStoredJiujiu(msg);
}

export function stripJiujiuAttachmentData(packet: JiujiuPacket): JiujiuPacket {
    const out: JiujiuPacket = { ...packet };
    if (!Array.isArray(out.attachments)) return out;
    out.attachments = out.attachments.map((att) => stripAttachNode(att));
    return out;
}

function stripAttachNode(att: JiujiuAttachNode): JiujiuAttachNode {
    const nested: JiujiuAttachNode = { ...att };
    if (isNestedJiujiuMessage(att)) {
        delete nested.data;
        if (Array.isArray(nested.attachments)) {
            nested.attachments = nested.attachments.map((child) => stripAttachNode(child));
        }
        return nested;
    }
    delete nested.data;
    return nested;
}

export function persistNestedAttachmentFiles(
    packet: JiujiuPacket,
    saveFile: (att: JiujiuAttachment, data: Buffer) => {
        url?: string;
        name?: string;
        mime?: string;
        kind?: string;
        size?: number;
        durationMs?: number;
    },
): JiujiuPacket {
    const out: JiujiuPacket = { ...packet };
    if (!Array.isArray(out.attachments)) return stripJiujiuAttachmentData(out);
    out.attachments = out.attachments.map((att) => persistAttachNode(att, saveFile));
    return out;
}

function persistAttachNode(
    att: JiujiuAttachNode,
    saveFile: (att: JiujiuAttachment, data: Buffer) => {
        url?: string;
        name?: string;
        mime?: string;
        kind?: string;
        size?: number;
        durationMs?: number;
    },
): JiujiuAttachNode {
    if (isNestedJiujiuMessage(att)) {
        const nested: JiujiuAttachNode = { ...att };
        delete nested.data;
        if (Array.isArray(nested.attachments)) {
            nested.attachments = nested.attachments.map((child) => persistAttachNode(child, saveFile));
        }
        return nested;
    }
    const buf = decodeJiujiuBase64(att.data);
    const rest: JiujiuAttachNode = { ...att };
    delete rest.data;
    if (!buf) return rest;
    const saved = saveFile(att, buf);
    if (saved.url) rest.url = saved.url;
    if (saved.name) rest.name = saved.name;
    if (saved.mime) rest.mime = saved.mime;
    if (saved.kind) rest.kind = saved.kind;
    if (saved.size != null) rest.size = saved.size;
    if (saved.durationMs != null) rest.durationMs = saved.durationMs;
    return rest;
}

export function hydrateJiujiuAttachmentData(
    packet: JiujiuPacket,
    readFile: (url: string) => { data: Buffer; mime: string } | null,
): JiujiuPacket {
    const out: JiujiuPacket = { ...packet };
    if (!Array.isArray(out.attachments)) return out;
    out.attachments = out.attachments.map((att) => hydrateAttachNode(att, readFile));
    return out;
}

function hydrateAttachNode(
    att: JiujiuAttachNode,
    readFile: (url: string) => { data: Buffer; mime: string } | null,
): JiujiuAttachNode {
    if (isNestedJiujiuMessage(att)) {
        const nested: JiujiuAttachNode = { ...att };
        if (Array.isArray(nested.attachments)) {
            nested.attachments = nested.attachments.map((child) => hydrateAttachNode(child, readFile));
        }
        return nested;
    }
    const url = String(att.url || '').trim();
    if (!url) return att;
    const file = readFile(url);
    if (!file?.data?.length || file.data.length > JIUJIU_MAX_ATTACH_BYTES) return att;
    const rest: JiujiuAttachNode = { ...att };
    rest.data = file.data.toString('base64');
    if (!rest.mime) rest.mime = file.mime;
    delete rest.url;
    return rest;
}

function packetFromStoredJiujiu(msg: OldBuddyMessage): JiujiuPacket | null {
    if (!msg.jiujiu) return null;
    const stored = normalizeJiujiuPacket(msg.jiujiu);
    if (!isJiujiuJsonStored(stored)) return null;
    const packet = normalizeJiujiuPacket({
        ...stored,
        content: msg.content || stored.content,
        msgId: msg.id || stored.msgId,
        timestamp: oldBuddyTimestampToMs(msg.timestamp),
        senderId: msg.sender || stored.senderId,
        senderName: msg.senderName || stored.senderName,
        target: msg.target || stored.target,
    });
    return packetToOutgoing(packet);
}

/** 网页 OldBuddy：啾啾信封，附件用 url 不内嵌 Base64。 */
export function oldBuddyToWebPacket(msg: OldBuddyMessage): JiujiuPacket {
    const stored = parseOldBuddyJsonPacket(msg);
    let packet: JiujiuPacket;
    if (stored) {
        packet = { ...stored };
    } else if (msg.type === 'action' || msg.action) {
        packet = actionMessageToJiujiuPacket(msg);
    } else {
        packet = {
            type: msg.type === 'audio' ? 'audio' : msg.type === 'welcome' ? 'welcome' : 'message',
            content: String(msg.content || ''),
            msgId: msg.id,
            timestamp: oldBuddyTimestampToMs(msg.timestamp),
        };
    }
    packet.msgId = String(msg.id || packet.msgId || '');
    packet.timestamp = packet.timestamp ?? oldBuddyTimestampToMs(msg.timestamp);
    if (msg.sender) packet.senderId = msg.sender;
    if (msg.senderName && !packet.senderName) packet.senderName = msg.senderName;
    if (msg.target && !packet.target) packet.target = msg.target;
    if (msg.friendName && !packet.friendName) packet.friendName = msg.friendName;
    const atts = normalizeAttachments(msg.attachments);
    if (atts.length && !(Array.isArray(packet.attachments) && packet.attachments.some((row) => isNestedJiujiuMessage(row)))) {
        packet.attachments = atts.map((att) => {
            const row: JiujiuAttachment = {};
            if (att.name) row.name = att.name;
            if (att.mime) row.mime = att.mime;
            if (att.kind) row.kind = att.kind;
            if (att.url) row.url = att.url;
            if (att.size != null && Number.isFinite(Number(att.size))) row.size = Number(att.size);
            if (att.durationMs != null && Number.isFinite(Number(att.durationMs))) {
                row.durationMs = Number(att.durationMs);
            }
            return row;
        });
    }
    return packetToOutgoing(packet);
}

export function looksLikeJiujiuClientPayload(fields: Record<string, unknown>): boolean {
    if (fields.msgId != null || fields.senderId != null) return true;
    if (isRecord(fields.card)) return true;
    if ((Array.isArray(fields.urls) && fields.urls.length) || (Array.isArray(fields.tabs) && fields.tabs.length)) return true;
    if ((Array.isArray(fields.actions) && fields.actions.length) || (Array.isArray(fields.fields) && fields.fields.length)) return true;
    const t = String(fields.type || '').trim().toLowerCase();
    return isJiujiuInteractiveType(t) || isJiujiuWebsiteType(t) || isJiujiuResultType(t)
        || isJiujiuSliderType(t) || isJiujiuHtmlType(t)
        || t === 'welcome' || t === 'action';
}

/** 聊天正文里的 JSON/YAML：对得上啾啾协议（含 `message` 信封和卡片）才转。 */
export function looksLikeSpecialChatPayload(fields: Record<string, unknown>): boolean {
    if (isRecord(fields.card)) return true;
    if ((Array.isArray(fields.urls) && fields.urls.length) || (Array.isArray(fields.tabs) && fields.tabs.length)) return true;
    if ((Array.isArray(fields.actions) && fields.actions.length) || (Array.isArray(fields.fields) && fields.fields.length)) return true;
    const t = String(fields.type || '').trim().toLowerCase();
    if (!t) return false;
    return t === 'text' || t === 'json' || isEnvelopeType(t) || isJiujiuCardStoredType(t);
}

function unwrapChatStructuredText(raw: string): string {
    const s = raw.trim().replace(/^\uFEFF/, '');
    const fenced = /^```(?:json|yaml|yml)?\s*\r?\n([\s\S]*?)\r?\n```\s*$/i.exec(s);
    return fenced ? fenced[1].trim() : s;
}

function tryParseObjectFromChatText(raw: string): Record<string, unknown> | null {
    const text = unwrapChatStructuredText(raw);
    if (!text) return null;
    const head = text.trimStart();
    if (head.startsWith('{')) {
        try {
            const json = JSON.parse(text) as unknown;
            if (isRecord(json)) return json;
        } catch {
            // JSON 失败时再试 YAML（允许尾逗号等）
        }
    } else if (head.startsWith('[')) {
        return null;
    }
    try {
        const yaml = parseYaml(text) as unknown;
        return isRecord(yaml) ? yaml : null;
    } catch {
        return null;
    }
}

/** 用户发送的 JSON/YAML 若匹配网站卡、互动卡、轮播、HTML 等，转为对应协议包。 */
export function tryParseEmbeddedSpecialPacket(content: string): JiujiuPacket | null {
    const fields = tryParseObjectFromChatText(content);
    if (!fields || !looksLikeSpecialChatPayload(fields)) return null;
    return normalizeJiujiuPacket(fields);
}

/** 信封 `type=message` 的 content 里若嵌了特殊卡片，提升为该 type。 */
export function liftEmbeddedSpecialPacket(packet: JiujiuPacket): JiujiuPacket {
    if (isJiujiuJsonStored(packet) || isJiujiuActionPacket(packet)) return packet;
    const t = String(packet.type || '').trim().toLowerCase();
    if (t && t !== 'message' && t !== 'text') return packet;
    const inner = tryParseEmbeddedSpecialPacket(String(packet.content || ''));
    if (!inner) return packet;
    if (packet.msgId) inner.msgId = packet.msgId;
    if (packet.timestamp != null) inner.timestamp = packet.timestamp;
    if (packet.senderId) inner.senderId = packet.senderId;
    if (packet.senderName) inner.senderName = packet.senderName;
    if (packet.target) inner.target = packet.target;
    return inner;
}

export function oldBuddyToJiujiuPacket(
    msg: OldBuddyMessage,
    attachment?: { data: Buffer; mime: string } | null,
): JiujiuPacket {
    const stored = parseOldBuddyJsonPacket(msg);
    if (stored) return stored;
    if (msg.type === 'action' || msg.action) {
        return actionMessageToJiujiuPacket(msg);
    }
    const packet: JiujiuPacket = {
        type: msg.type === 'audio' ? 'audio' : msg.type === 'welcome' ? 'welcome' : 'message',
        content: String(msg.content || ''),
        msgId: msg.id,
        timestamp: oldBuddyTimestampToMs(msg.timestamp),
    };
    if (msg.sender) packet.senderId = msg.sender;
    if (msg.senderName) packet.senderName = msg.senderName;
    if (attachment?.data?.length && attachment.data.length <= JIUJIU_MAX_ATTACH_BYTES) {
        packet.attachments = [
            {
                name: 'file',
                mime: attachment.mime || 'application/octet-stream',
                kind: attachmentKindToJiujiu(msg.type === 'audio' ? 'audio' : '', attachment.mime),
                data: attachment.data.toString('base64'),
                durationMs: 0,
            },
        ];
    }
    return packet;
}

export function envelopeToJiujiuPacket(
    msg: OldBuddyMessage,
    files: Array<{ att: OldBuddyAttachment; data: Buffer; mime: string }>,
): JiujiuPacket {
    const stored = parseOldBuddyJsonPacket(msg);
    if (stored) {
        if (files.length) {
            const attachments: JiujiuAttachment[] = [];
            for (const row of files) {
                if (!row.data?.length || row.data.length > JIUJIU_MAX_ATTACH_BYTES) continue;
                attachments.push({
                    name: row.att.name || 'file',
                    mime: row.mime || row.att.mime || 'application/octet-stream',
                    kind: attachmentKindToJiujiu(row.att.kind, row.mime),
                    data: row.data.toString('base64'),
                    durationMs: row.att.durationMs || 0,
                });
            }
            if (attachments.length) stored.attachments = attachments;
        }
        return stored;
    }
    if (msg.type === 'action' || msg.action) {
        return actionMessageToJiujiuPacket(msg, files);
    }
    const packet: JiujiuPacket = {
        type: msg.type === 'audio' ? 'audio' : msg.type === 'welcome' ? 'welcome' : 'message',
        content: String(msg.content || ''),
        msgId: msg.id,
        timestamp: oldBuddyTimestampToMs(msg.timestamp),
    };
    if (msg.sender) packet.senderId = msg.sender;
    if (msg.senderName) packet.senderName = msg.senderName;
    const attachments: JiujiuAttachment[] = [];
    for (const row of files) {
        if (!row.data?.length || row.data.length > JIUJIU_MAX_ATTACH_BYTES) continue;
        attachments.push({
            name: row.att.name || 'file',
            mime: row.mime || row.att.mime || 'application/octet-stream',
            kind: attachmentKindToJiujiu(row.att.kind, row.mime),
            data: row.data.toString('base64'),
            durationMs: row.att.durationMs || 0,
        });
    }
    if (attachments.length) packet.attachments = attachments;
    return packet;
}

export function jiujiuTypeToOldBuddy(type: string | undefined): OldBuddyMessageType {
    const t = String(type || 'message').toLowerCase();
    if (t === 'audio') return 'audio';
    if (t === 'welcome') return 'welcome';
    if (t === 'action' || t === 'player' || t === 'timer' || t === 'alarm') return 'action';
    return 'message';
}
