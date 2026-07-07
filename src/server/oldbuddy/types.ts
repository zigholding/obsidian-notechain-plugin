export type OldBuddyMessageType = 'text' | 'image' | 'audio' | 'video' | 'file';

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
