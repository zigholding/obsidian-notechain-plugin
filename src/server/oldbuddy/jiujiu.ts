import type { OldBuddyAttachment, OldBuddyMessage, OldBuddyMessageType } from './types';
import { isUserSender } from './types';

export const JIUJIU_MAX_ATTACH_BYTES = 6 * 1024 * 1024;

export type JiujiuAttachKind = 'image' | 'audio' | 'file';

export interface JiujiuAttachment {
    name?: string;
    mime?: string;
    kind?: string;
    data?: string;
    durationMs?: number;
}

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
    attachments?: JiujiuAttachment[];
    [key: string]: unknown;
}

export function pickPushFriend(packet: JiujiuPacket): { friendName: string; friendId: string } {
    const friendName = String(packet.friendName ?? packet.friend ?? '').trim();
    const friendId = String(packet.friendId ?? '').trim();
    return { friendName, friendId };
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
        return v as JiujiuPacket;
    } catch {
        return null;
    }
}

export function jiujiuWelcomePacket(): JiujiuPacket {
    return {
        type: 'welcome',
        content:
            '我是 **OldBuddy（老友）**。直接发文字、图片或语音即可。\n\n' +
            '回复由笔记脚本 `nochain_oldbuddy_reply` 生成。发送 `/help` 可再看本说明。',
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

export function jiujiuTimestampToIso(ts: unknown): string {
    const n = Number(ts);
    if (Number.isFinite(n) && n > 0) {
        const ms = n < 1e12 ? n * 1000 : n;
        return new Date(ms).toISOString();
    }
    return new Date().toISOString();
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

export function jiujiuKindToType(kind: string | undefined, mime: string | undefined): OldBuddyMessageType {
    const k = String(kind || '').toLowerCase();
    const m = String(mime || '').toLowerCase();
    if (k === 'image' || m.startsWith('image/')) return 'image';
    if (k === 'audio' || m.startsWith('audio/')) return 'audio';
    if (m.startsWith('video/')) return 'video';
    return 'file';
}

export function oldBuddyTypeToJiujiuKind(type: OldBuddyMessageType): JiujiuAttachKind {
    if (type === 'image') return 'image';
    if (type === 'audio') return 'audio';
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
            kind: row.att.kind || 'audio',
            data: row.data.toString('base64'),
            durationMs: row.att.durationMs || 0,
        });
    }
    if (attachments.length) packet.attachments = attachments;
    return packet;
}

export function oldBuddyToJiujiuPacket(
    msg: OldBuddyMessage,
    attachment?: { data: Buffer; mime: string } | null,
): JiujiuPacket {
    if (msg.type === 'action' || msg.action) {
        return actionMessageToJiujiuPacket(msg);
    }
    const isMedia = msg.type !== 'text' && msg.type !== 'message' && msg.type !== 'welcome';
    const packet: JiujiuPacket = {
        type: msg.type === 'audio' ? 'audio' : msg.type === 'welcome' ? 'welcome' : 'message',
        content: isMedia ? String(msg.extra_text || msg.file_name || '') : msg.content,
        msgId: msg.id,
        timestamp: oldBuddyTimestampToMs(msg.timestamp),
    };
    if (msg.sender) packet.senderId = msg.sender;
    if (msg.senderName) packet.senderName = msg.senderName;
    if (isMedia && attachment?.data?.length && attachment.data.length <= JIUJIU_MAX_ATTACH_BYTES) {
        packet.attachments = [
            {
                name: msg.file_name || 'file',
                mime: attachment.mime || 'application/octet-stream',
                kind: oldBuddyTypeToJiujiuKind(
                    msg.type === 'image' ? 'image' : msg.type === 'audio' ? 'audio' : 'file',
                ),
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
            kind: row.att.kind || oldBuddyTypeToJiujiuKind(jiujiuKindToType(row.att.kind, row.mime)),
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
