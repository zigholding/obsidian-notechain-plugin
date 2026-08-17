export const OLDBUDDY_MESSAGE_TYPES = [
    'text',
    'image',
    'audio',
    'video',
    'file',
    'message',
    'welcome',
] as const;

export type OldBuddyMessageType = (typeof OLDBUDDY_MESSAGE_TYPES)[number];

/** 啾啾兼容附件：存储用 url，出站再读文件填 Base64 */
export interface OldBuddyAttachment {
    name?: string;
    mime?: string;
    kind?: string;
    url?: string;
    size?: number;
    durationMs?: number;
}

/** Templater 脚本统一返回格式：{ label, text }
 *  - label：列表主显示（短名、说明性文字）
 *  - text：选中后写入输入框的实际内容（@引用、#标签等）；与 label 相同时不重复显示副标题
 */
export interface OldBuddyLabelTextItem {
    label: string;
    text: string;
}

export interface OldBuddyMessage {
    id: string;
    sender: string;
    target?: string;
    timestamp: string;
    type: OldBuddyMessageType;
    content: string;
    extra_text?: string;
    file_name?: string;
    file_size?: number;
    card?: boolean;
    senderName?: string;
    attachments?: OldBuddyAttachment[];
}

export interface OldBuddyTarget {
    id: string;
    label: string;
    switch_phrases?: string[];
    /** templater 模板路径，用于该 target 的回复 */
    template?: string;
}

export interface OldBuddyTargetsConfig {
    default_target: string;
    targets: OldBuddyTarget[];
}

/** 头像配置：sender id → [昵称, 头像路径或 URL] */
export type OldBuddyAvatarEntry = [string, string] | { name?: string; label?: string; nickname?: string; avatar?: string; img?: string; text?: string };

export interface OldBuddyAvatarProfile {
    id: string;
    name: string;
    avatar: string;
}

export type OldBuddyAvatarMap = Record<string, OldBuddyAvatarProfile>;

/** sender 为 user 或 user_* 时视作用户侧消息（右侧气泡、可触发 reply） */
export function isUserSender(sender?: string | null): boolean {
    const s = String(sender ?? '').trim();
    return s === 'user' || s.startsWith('user_');
}

export function isEnvelopeType(type?: string | null): boolean {
    const t = String(type || '');
    return t === 'message' || t === 'welcome' || t === 'audio';
}

export function normalizeAttachments(raw: unknown): OldBuddyAttachment[] {
    if (!Array.isArray(raw)) return [];
    const out: OldBuddyAttachment[] = [];
    for (const row of raw) {
        if (!row || typeof row !== 'object') continue;
        const a = row as Record<string, unknown>;
        const url = String(a.url ?? '').trim();
        const name = String(a.name ?? '').trim();
        if (!url && !name) continue;
        const att: OldBuddyAttachment = {};
        if (name) att.name = name;
        const mime = String(a.mime ?? '').trim();
        if (mime) att.mime = mime;
        const kind = String(a.kind ?? '').trim();
        if (kind) att.kind = kind;
        if (url) att.url = url;
        if (a.size != null && Number.isFinite(Number(a.size))) att.size = Number(a.size);
        if (a.durationMs != null && Number.isFinite(Number(a.durationMs))) {
            att.durationMs = Number(a.durationMs);
        }
        out.push(att);
    }
    return out;
}
