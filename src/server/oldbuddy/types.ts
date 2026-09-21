export const OLDBUDDY_MESSAGE_TYPES = [
    'message',
    'audio',
    'welcome',
    'action',
    'json',
    'interactive',
    'card',
    'form',
    'ui',
    'interactive_card',
    'website',
    'web',
    'lookup',
    'sites',
    'interactive_result',
    'card_result',
    'form_result',
    'slider',
    'carousel',
    'slideshow',
    'html',
    'html_card',
    'richhtml',
] as const;

export type OldBuddyMessageType = string;

const LEGACY_MEDIA_TYPES = new Set([
    'text', 'image', 'audio', 'video', 'file', 'message', 'welcome', 'action', 'json',
    'interactive', 'card', 'form', 'ui', 'interactive_card',
    'website', 'web', 'lookup', 'sites',
    'interactive_result', 'card_result', 'form_result',
    'slider', 'carousel', 'slideshow',
    'html', 'html_card', 'richhtml',
]);

const JIUJIU_CARD_STORED_TYPES = new Set([
    'interactive', 'card', 'form', 'ui', 'interactive_card',
    'website', 'web', 'lookup', 'sites',
    'interactive_result', 'card_result', 'form_result',
    'slider', 'carousel', 'slideshow',
    'html', 'html_card', 'richhtml',
]);

export function isJiujiuCardStoredType(type?: string | null): boolean {
    return JIUJIU_CARD_STORED_TYPES.has(String(type || '').trim().toLowerCase());
}

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
    card?: boolean;
    senderName?: string;
    attachments?: OldBuddyAttachment[];
    /** 卡片协议（去掉 type）；YAML 里是对象 */
    config?: Record<string, unknown>;
    /** 啾啾 action：player / timer / alarm */
    action?: string;
    name?: string;
    durationMs?: number;
    hour?: number;
    minute?: number;
    direct?: boolean;
    quick_cmd_id?: string;
    /** 旧字段，仅读历史时出现；normalize 后不再写入 */
    extra_text?: string;
    file_name?: string;
    file_size?: number;
    friendName?: string;
    /** 旧字段：卡片曾拆进这里；新入库用 type + config */
    jiujiu?: Record<string, unknown>;
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
    return t === 'message' || t === 'welcome' || t === 'audio' || t === 'action';
}

export function asProtocolConfig(raw: unknown): Record<string, unknown> | undefined {
    if (typeof raw === 'string') {
        const text = raw.trim();
        if (!text) return undefined;
        try {
            const value = JSON.parse(text) as unknown;
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                return value as Record<string, unknown>;
            }
        } catch {
            return undefined;
        }
        return undefined;
    }
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return { ...(raw as Record<string, unknown>) };
    }
    return undefined;
}

export function looksLikeUploadUrl(value: string | undefined | null): boolean {
    return /\/oldbuddy\/uploads\//i.test(String(value || ''));
}

export function attachmentKindFromMime(
    mime?: string | null,
    filename?: string | null,
    declared?: string | null,
): string {
    const m = String(mime || '').toLowerCase();
    const name = String(filename || '').toLowerCase();
    const d = String(declared || '').toLowerCase();
    if (d === 'image' || d === 'audio' || d === 'video' || d === 'file') {
        if (m.startsWith('video/') || /\.(mp4|mov|m4v|mkv|3gp|avi)$/i.test(name)) return 'video';
        if (m.startsWith('audio/') || /\.(m4a|mp3|wav|ogg|aac|amr|caf)$/i.test(name)) return 'audio';
        if (m.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(name)) return 'image';
        if (d === 'audio' || d === 'video') return d;
        return d === 'image' ? 'image' : d === 'file' ? 'file' : d;
    }
    if (m.startsWith('video/') || /\.(mp4|mov|m4v|mkv|3gp|avi)$/i.test(name)) return 'video';
    if (m.startsWith('audio/') || /\.(m4a|mp3|wav|ogg|aac|amr|caf)$/i.test(name)) return 'audio';
    if (m.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(name)) return 'image';
    return 'file';
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

function asIsoTimestamp(value: unknown): string {
    if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString();
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) {
        const ms = n < 1e12 ? n * 1000 : n;
        return new Date(ms).toISOString();
    }
    const s = String(value || '').trim();
    if (!s) return new Date().toISOString();
    const t = Date.parse(s);
    return Number.isFinite(t) ? new Date(t).toISOString() : s;
}

function toEnvelopeType(rawType: string): OldBuddyMessageType {
    const t = String(rawType || '').toLowerCase();
    if (t === 'audio') return 'audio';
    if (t === 'welcome') return 'welcome';
    if (t === 'json') return 'json';
    if (t === 'action' || t === 'player' || t === 'timer' || t === 'alarm') return 'action';
    if (t === 'text' || t === 'image' || t === 'video' || t === 'file' || t === 'message' || !t) return 'message';
    return t;
}

/** 旧 text/image/video/file 及 content=url 的 audio → 啾啾信封。不改日记，只在读/写路径调用。 */
export function normalizeOldBuddyMessage(raw: unknown): OldBuddyMessage | null {
    if (!raw || typeof raw !== 'object') return null;
    const row = raw as Record<string, unknown>;
    const id = String(row.id ?? row.msgId ?? '').trim();
    const sender = String(row.sender ?? row.senderId ?? '').trim();
    if (!id || !sender) return null;

    const rawType = String(row.type || 'message').toLowerCase();
    if (rawType && !LEGACY_MEDIA_TYPES.has(rawType) && rawType !== 'player' && rawType !== 'timer' && rawType !== 'alarm') {
        // unknown types still become message
    }

    let content = '';
    if (row.content != null && typeof row.content === 'object') {
        try {
            content = JSON.stringify(row.content);
        } catch {
            content = String(row.content);
        }
    } else if (row.content != null) {
        content = String(row.content);
    }
    const extraText = String(row.extra_text ?? '').trim();
    const fileName = String(row.file_name ?? '').trim();
    const fileSize =
        row.file_size != null && Number.isFinite(Number(row.file_size)) ? Number(row.file_size) : undefined;
    let attachments = normalizeAttachments(row.attachments);
    let type = toEnvelopeType(rawType);
    const config = asProtocolConfig(row.config)
        || (isJiujiuCardStoredType(type) && !Array.isArray(row.attachments)
            ? asProtocolConfig(row.attachments)
            : undefined);

    const legacyMedia = rawType === 'image' || rawType === 'video' || rawType === 'file';
    const legacyAudioUrl = rawType === 'audio' && looksLikeUploadUrl(content) && !attachments.length;
    if ((legacyMedia || legacyAudioUrl) && looksLikeUploadUrl(content)) {
        const kind = attachmentKindFromMime('', fileName, rawType);
        attachments = [
            {
                name: fileName || undefined,
                kind,
                url: content,
                size: fileSize,
            },
            ...attachments,
        ];
        content = extraText;
        type = rawType === 'audio' ? 'audio' : 'message';
    } else if (rawType === 'text') {
        type = 'message';
        if (extraText && !content) content = extraText;
    } else if (extraText && !content) {
        content = extraText;
    }

    const out: OldBuddyMessage = {
        id,
        sender,
        timestamp: asIsoTimestamp(row.timestamp),
        type,
        content,
    };
    const target = String(row.target ?? '').trim();
    if (target) out.target = target;
    const cardObj = row.card && typeof row.card === 'object' && !Array.isArray(row.card)
        ? { ...(row.card as Record<string, unknown>) }
        : undefined;
    if (cardObj) {
        const stored: Record<string, unknown> = { ...(out.config || {}), card: cardObj };
        delete stored.type;
        out.config = stored;
        if (!isJiujiuCardStoredType(out.type)) {
            out.type = String(rawType || 'interactive');
        }
    } else if (row.card === true || row.card === 'true' || row.card === 1) {
        out.card = true;
    }
    if ((Array.isArray(row.urls) && row.urls.length) || (Array.isArray(row.tabs) && row.tabs.length)) {
        const stored: Record<string, unknown> = { ...(out.config || {}) };
        if (Array.isArray(row.urls) && !stored.urls) stored.urls = row.urls;
        if (Array.isArray(row.tabs) && !stored.tabs) stored.tabs = row.tabs;
        const layout = String(row.layout ?? stored.layout ?? '').trim();
        if (layout) stored.layout = layout;
        delete stored.type;
        out.config = stored;
        if (!isJiujiuCardStoredType(out.type)) out.type = String(rawType || 'website');
    }
    const senderName = String(row.senderName ?? '').trim();
    if (senderName) out.senderName = senderName;
    const friendName = String(row.friendName ?? '').trim();
    if (friendName) out.friendName = friendName;
    if (attachments.length) out.attachments = attachments;
    if (config && Object.keys(config).length) {
        const stored = { ...config, ...(out.config || {}) };
        delete stored.type;
        out.config = stored;
    }
    const action = String(row.action ?? (rawType === 'player' || rawType === 'timer' || rawType === 'alarm' ? rawType : '')).trim();
    if (type === 'action' && action) out.action = action;
    else if (action && type !== 'json' && !isJiujiuCardStoredType(type)) {
        out.type = 'action';
        out.action = action;
    }
    const name = String(row.name ?? '').trim();
    if (name) out.name = name;
    if (row.durationMs != null && Number.isFinite(Number(row.durationMs))) {
        out.durationMs = Number(row.durationMs);
    }
    if (row.hour != null && Number.isFinite(Number(row.hour))) out.hour = Number(row.hour);
    if (row.minute != null && Number.isFinite(Number(row.minute))) out.minute = Number(row.minute);
    if (row.direct === true || row.direct === 'true' || row.direct === 1) out.direct = true;
    const quick = String(row.quick_cmd_id ?? '').trim();
    if (quick) out.quick_cmd_id = quick;
    if (row.jiujiu && typeof row.jiujiu === 'object' && !Array.isArray(row.jiujiu)) {
        out.jiujiu = row.jiujiu as Record<string, unknown>;
    }
    return out;
}
