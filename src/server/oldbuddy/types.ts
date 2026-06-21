export type OldBuddyMessageType = 'text' | 'image' | 'audio' | 'file';

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
