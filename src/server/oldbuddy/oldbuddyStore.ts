let fs = require('fs');
let path = require('path');
let crypto = require('crypto');

import { OldBuddyMessage, OldBuddyTargetsConfig, OldBuddyLabelTextItem } from './types';
import { OldBuddyWebSocketHub } from './oldbuddyWebSocket';
import { Templater } from '../../easyapi/templater';

const DEFAULT_TARGETS: OldBuddyLabelTextItem[] = [{ label: 'local', text: 'local' }];
const DEFAULT_QUICK_COMMANDS: OldBuddyLabelTextItem[] = [{ label: '你是谁', text: '你是谁' }];
const TARGETS_TEMPLATE = 'nochain_oldbuddy_targets';
const QUICK_COMMANDS_TEMPLATE = 'nochain_oldbuddy_quick_commands';
const QUERY_TEMPLATE = 'nochain_oldbuddy_query';
const SAVE_TEMPLATE = 'nochain_oldbuddy_save';
const MAX_MESSAGES = 5000;
const DEFAULT_REPLY_TEMPLATE = 'nochain_oldbuddy_reply';
const DEFAULT_TARGET = DEFAULT_TARGETS[0].text;

export class OldBuddyStore {
    private messages: OldBuddyMessage[] = [];
    private dataDir: string;
    private uploadsDir: string;
    private messagesFile: string;
    private ws = new OldBuddyWebSocketHub();
    private loaded = false;

    constructor(
        private templater: Templater,
        configDir: string,
        private replyTemplate: string = DEFAULT_REPLY_TEMPLATE,
    ) {
        this.dataDir = path.join(configDir, 'plugins', 'note-chain', 'oldbuddy-data');
        this.uploadsDir = path.join(this.dataDir, 'uploads');
        this.messagesFile = path.join(this.dataDir, 'messages.json');
    }

    getWebSocketHub() {
        return this.ws;
    }

    ensureLoaded() {
        if (this.loaded) return;
        this.loaded = true;
        try {
            fs.mkdirSync(this.uploadsDir, { recursive: true });
        } catch {
            // ignore
        }
        try {
            if (fs.existsSync(this.messagesFile)) {
                const raw = fs.readFileSync(this.messagesFile, 'utf8');
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    this.messages = parsed;
                }
            }
        } catch (e) {
            console.warn('[oldbuddy] load messages failed:', e);
        }
    }

    private persist() {
        try {
            fs.mkdirSync(this.dataDir, { recursive: true });
            fs.writeFileSync(this.messagesFile, JSON.stringify(this.messages, null, 2), 'utf8');
        } catch (e) {
            console.warn('[oldbuddy] persist messages failed:', e);
        }
    }

    private newId() {
        return `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    }

    private pushMessage(msg: OldBuddyMessage) {
        this.messages.push(msg);
        if (this.messages.length > MAX_MESSAGES) {
            this.messages = this.messages.slice(-MAX_MESSAGES);
        }
        this.persist();
        this.ws.broadcast(msg);
        void this.saveMessageViaScript(msg);
        return msg;
    }

    /** 可选：nochain_oldbuddy_save，extra.oldbuddy = { action, message, messages } */
    private async saveMessageViaScript(msg: OldBuddyMessage) {
        await this.invokeTemplaterOptional(SAVE_TEMPLATE, {
            oldbuddy: {
                action: 'save',
                message: msg,
                messages: this.messages,
                data_dir: this.dataDir,
                messages_file: this.messagesFile,
            },
        });
    }

    async listMessages(limit: number, before?: string | null, target?: string | null) {
        this.ensureLoaded();
        let list = [...this.messages];
        const queried = await this.queryMessagesViaScript({
            limit,
            before: before || null,
            target: target || null,
            local: list,
        });
        if (queried) {
            list = mergeMessages(list, queried);
        }
        list.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        if (before) {
            const beforeMs = Date.parse(before);
            if (Number.isFinite(beforeMs)) {
                list = list.filter((m) => new Date(m.timestamp).getTime() < beforeMs);
            }
        }
        if (target) {
            list = list.filter((m) => (m.target || DEFAULT_TARGET) === target);
        }
        const slice = list.slice(-Math.max(1, limit));
        const hasMore = list.length > slice.length;
        return { messages: slice, has_more: hasMore };
    }

    /** 可选：nochain_oldbuddy_query，返回 OldBuddyMessage[] 或 { messages: [] }，与本地记录合并 */
    private async queryMessagesViaScript(params: {
        limit: number;
        before: string | null;
        target: string | null;
        local: OldBuddyMessage[];
    }): Promise<OldBuddyMessage[] | null> {
        const result = await this.invokeTemplaterOptional(QUERY_TEMPLATE, {
            oldbuddy: {
                action: 'query',
                limit: params.limit,
                before: params.before,
                target: params.target,
                messages: params.local,
                data_dir: this.dataDir,
                messages_file: this.messagesFile,
            },
        });
        return normalizeMessages(result);
    }

    private async invokeTemplaterOptional(templateName: string, extra: Record<string, unknown>): Promise<unknown | null> {
        if (!this.templater.ea.file.get_tfile(templateName)) {
            return null;
        }
        try {
            return await this.templater.parse_templater(templateName, true, extra, 0, '');
        } catch (e) {
            console.warn(`[oldbuddy] ${templateName} failed:`, e);
            return null;
        }
    }

    getUploadsDir() {
        this.ensureLoaded();
        return this.uploadsDir;
    }

    saveUpload(fileBuf: Buffer, originalName: string, mime: string) {
        this.ensureLoaded();
        const ext = path.extname(originalName || '') || guessExt(mime);
        const base = sanitizeBaseName(path.basename(originalName || 'file', ext)) || 'file';
        const fname = `${Date.now()}_${base}${ext}`;
        const abs = path.join(this.uploadsDir, fname);
        fs.writeFileSync(abs, fileBuf);
        return { fname, abs, url: `/oldbuddy/uploads/${encodeURIComponent(fname)}` };
    }

    serveUploadFile(fname: string): { data: Buffer; mime: string } | null {
        this.ensureLoaded();
        const safe = path.basename(fname);
        if (!safe || safe.includes('..')) return null;
        const abs = path.join(this.uploadsDir, safe);
        if (!fs.existsSync(abs)) return null;
        return { data: fs.readFileSync(abs), mime: mimeFromExt(abs) };
    }

    private async parseLabelTextTemplate(
        templateName: string,
        fallback: OldBuddyLabelTextItem[],
    ): Promise<OldBuddyLabelTextItem[]> {
        if (!this.templater.ea.file.get_tfile(templateName)) {
            return fallback;
        }
        try {
            const result = await this.templater.parse_templater(templateName, true, null, 0, '');
            const items = normalizeLabelTextList(result);
            return items.length ? items : fallback;
        } catch {
            return fallback;
        }
    }

    /** 聊天对象 target；模板 nochain_oldbuddy_targets 不存在或为空时返回 [{ label: 'local', text: 'local' }] */
    async parse_oldbuddy_targets(): Promise<OldBuddyLabelTextItem[]> {
        return this.parseLabelTextTemplate(TARGETS_TEMPLATE, DEFAULT_TARGETS);
    }

    async loadTargetsConfig(): Promise<OldBuddyTargetsConfig> {
        const items = await this.parse_oldbuddy_targets();
        const targets = items.map((item) => ({
            id: item.text || item.label,
            label: item.label || item.text,
        }));
        const first = items[0];
        return {
            default_target: first ? (first.text || first.label) : DEFAULT_TARGET,
            targets,
        };
    }

    /** 快捷命令按 target 分组；模板返回 { [targetId]: [{ label, text }, ...], '*': [...] } */
    async parse_oldbuddy_quick_commands_map(): Promise<Record<string, OldBuddyLabelTextItem[]>> {
        if (!this.templater.ea.file.get_tfile(QUICK_COMMANDS_TEMPLATE)) {
            return { [DEFAULT_TARGET]: [...DEFAULT_QUICK_COMMANDS] };
        }
        try {
            const result = await this.templater.parse_templater(QUICK_COMMANDS_TEMPLATE, true, null, 0, '');
            const map = normalizeQuickCommandsByTarget(result);
            return Object.keys(map).length ? map : { [DEFAULT_TARGET]: [...DEFAULT_QUICK_COMMANDS] };
        } catch {
            return { [DEFAULT_TARGET]: [...DEFAULT_QUICK_COMMANDS] };
        }
    }

    async loadQuickCommands(target?: string): Promise<{ id: string; label: string; text: string }[]> {
        const map = await this.parse_oldbuddy_quick_commands_map();
        const key = (target || DEFAULT_TARGET).trim() || DEFAULT_TARGET;
        const items =
            map[key] ??
            map['*'] ??
            map['_default'] ??
            map[DEFAULT_TARGET] ??
            DEFAULT_QUICK_COMMANDS;
        return labelTextItemsToCommands(items);
    }

    async addTextMessage(params: {
        content: string;
        sender?: string;
        target?: string;
        extra_text?: string;
        quick_cmd_id?: string;
        skipReply?: boolean;
    }) {
        this.ensureLoaded();
        const userMsg = this.pushMessage({
            id: this.newId(),
            sender: params.sender || 'user',
            target: params.target || DEFAULT_TARGET,
            timestamp: new Date().toISOString(),
            type: 'text',
            content: params.content,
            extra_text: params.extra_text,
        });

        if (!params.skipReply && (params.sender || 'user') === 'user') {
            await this.generateReply(userMsg, params.quick_cmd_id);
        }
        return userMsg;
    }

    async addFileMessage(params: {
        type: 'image' | 'audio' | 'file';
        url: string;
        sender?: string;
        target?: string;
        extra_text?: string;
        file_name?: string;
        file_size?: number;
    }) {
        this.ensureLoaded();
        const userMsg = this.pushMessage({
            id: this.newId(),
            sender: params.sender || 'user',
            target: params.target || DEFAULT_TARGET,
            timestamp: new Date().toISOString(),
            type: params.type,
            content: params.url,
            extra_text: params.extra_text,
            file_name: params.file_name,
            file_size: params.file_size,
        });
        if ((params.sender || 'user') === 'user') {
            await this.generateReply(userMsg);
        }
        return userMsg;
    }

    private async generateReply(userMsg: OldBuddyMessage, quickCmdId?: string) {
        const targets = await this.loadTargetsConfig();
        const targetCfg = targets.targets.find((t) => t.id === userMsg.target);
        const template = targetCfg?.template || this.replyTemplate;
        const recent = this.messages.slice(-30);
        let replyText = '';

        try {
            const extra = {
                oldbuddy: {
                    message: userMsg,
                    history: recent,
                    target: userMsg.target,
                    quick_cmd_id: quickCmdId || '',
                },
            };
            const result = await this.templater.parse_templater(template, true, extra, 0, '');
            if (typeof result === 'string' && result.trim()) {
                replyText = result.trim();
            } else if (Array.isArray(result) && result[0] && String(result[0]).trim()) {
                replyText = String(result[0]).trim();
            }
        } catch (e) {
            console.warn('[oldbuddy] templater reply failed:', e);
        }

        if (!replyText) {
            if (userMsg.type === 'text') {
                replyText = `嗯，我听到了：${userMsg.content}`;
            } else if (userMsg.type === 'image') {
                replyText = '收到你的图片了。';
            } else if (userMsg.type === 'audio') {
                replyText = '收到你的语音了。';
            } else {
                replyText = `收到你的${userMsg.file_name || '文件'}了。`;
            }
        }

        this.pushMessage({
            id: this.newId(),
            sender: 'buddy',
            target: userMsg.target,
            timestamp: new Date().toISOString(),
            type: 'text',
            content: replyText,
            card: true,
        });
    }

    close() {
        this.ws.closeAll();
    }
}

function mergeMessages(...sources: OldBuddyMessage[][]): OldBuddyMessage[] {
    const map = new Map<string, OldBuddyMessage>();
    for (const list of sources) {
        for (const m of list) {
            if (m?.id) {
                map.set(m.id, m);
            }
        }
    }
    return Array.from(map.values()).sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
}

function normalizeMessages(result: unknown): OldBuddyMessage[] | null {
    const value = unwrapTemplaterValue(result);
    if (value == null) {
        return null;
    }
    let arr: unknown[] | null = null;
    if (Array.isArray(value)) {
        arr = value;
    } else if (typeof value === 'object' && Array.isArray((value as { messages?: unknown }).messages)) {
        arr = (value as { messages: unknown[] }).messages;
    }
    if (!arr) {
        return null;
    }
    const out = arr.filter(isValidMessage);
    return out.length ? out : null;
}

function isValidMessage(m: unknown): m is OldBuddyMessage {
    if (!m || typeof m !== 'object') {
        return false;
    }
    const row = m as OldBuddyMessage;
    return (
        typeof row.id === 'string' &&
        typeof row.sender === 'string' &&
        typeof row.timestamp === 'string' &&
        typeof row.type === 'string' &&
        typeof row.content === 'string'
    );
}

function sanitizeBaseName(name: string) {
    return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);
}

function labelTextItemsToCommands(items: OldBuddyLabelTextItem[]): { id: string; label: string; text: string }[] {
    return items.map((item, i) => ({
        id: String(i),
        label: item.label || item.text,
        text: item.text || item.label,
    }));
}

function normalizeQuickCommandsByTarget(result: unknown): Record<string, OldBuddyLabelTextItem[]> {
    const value = unwrapTemplaterValue(result);
    if (Array.isArray(value)) {
        const items = normalizeLabelTextList(value);
        return items.length ? { '*': items } : {};
    }
    if (value && typeof value === 'object') {
        const map: Record<string, OldBuddyLabelTextItem[]> = {};
        for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
            const items = normalizeLabelTextList(val);
            if (items.length) {
                map[String(key).trim()] = items;
            }
        }
        return map;
    }
    return {};
}

function unwrapTemplaterValue(result: unknown): unknown {
    if (result == null || result === '') {
        return null;
    }
    let value: unknown = result;
    if (typeof value === 'string') {
        const s = value.trim();
        if (!s) return null;
        try {
            value = JSON.parse(s);
        } catch {
            return null;
        }
    }
    if (Array.isArray(value) && value.length === 1 && Array.isArray(value[0])) {
        return value[0];
    }
    return value;
}

function normalizeLabelTextList(result: unknown): OldBuddyLabelTextItem[] {
    const value = unwrapTemplaterValue(result);
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((row: any) => ({
            label: String(row?.label ?? '').trim(),
            text: String(row?.text ?? row?.label ?? '').trim(),
        }))
        .filter((row) => row.label || row.text);
}

function guessExt(mime: string) {
    if (mime.includes('jpeg')) return '.jpg';
    if (mime.includes('png')) return '.png';
    if (mime.includes('gif')) return '.gif';
    if (mime.includes('webp')) return '.webp';
    if (mime.includes('webm')) return '.webm';
    if (mime.includes('ogg')) return '.ogg';
    if (mime.includes('mpeg') || mime.includes('mp3')) return '.mp3';
    if (mime.includes('wav')) return '.wav';
    return '';
}

function mimeFromExt(filePath: string) {
    const ext = path.extname(filePath).toLowerCase();
    const map: Record<string, string> = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.webm': 'audio/webm',
        '.ogg': 'audio/ogg',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.yaml': 'text/yaml; charset=utf-8',
        '.yml': 'text/yaml; charset=utf-8',
        '.md': 'text/markdown; charset=utf-8',
    };
    return map[ext] || 'application/octet-stream';
}
