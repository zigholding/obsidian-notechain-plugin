import type { OldBuddyMessage, OldBuddyMessageType } from './types';
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
    attachments?: JiujiuAttachment[];
    [key: string]: unknown;
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

export function oldBuddyToJiujiuPacket(
    msg: OldBuddyMessage,
    attachment?: { data: Buffer; mime: string } | null,
): JiujiuPacket {
    const isMedia = msg.type !== 'text';
    const packet: JiujiuPacket = {
        type: msg.type === 'audio' ? 'audio' : 'message',
        content: isMedia ? String(msg.extra_text || msg.file_name || '') : msg.content,
        msgId: msg.id,
        timestamp: oldBuddyTimestampToMs(msg.timestamp),
    };
    if (isMedia && attachment?.data?.length && attachment.data.length <= JIUJIU_MAX_ATTACH_BYTES) {
        packet.attachments = [
            {
                name: msg.file_name || 'file',
                mime: attachment.mime || 'application/octet-stream',
                kind: oldBuddyTypeToJiujiuKind(msg.type),
                data: attachment.data.toString('base64'),
                durationMs: 0,
            },
        ];
    }
    return packet;
}
