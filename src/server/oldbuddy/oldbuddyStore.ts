let fs = require('fs');
let path = require('path');
let crypto = require('crypto');

import { OldBuddyMessage, OldBuddyTargetsConfig, OldBuddyLabelTextItem } from './types';
import { OldBuddyWebSocketHub } from './oldbuddyWebSocket';
import { Templater } from '../../easyapi/templater';

const DEFAULT_SENDERS: OldBuddyLabelTextItem[] = [{ label: 'local', text: 'local' }];
const DEFAULT_QUICK_COMMANDS: OldBuddyLabelTextItem[] = [{ label: '你是谁', text: '你是谁' }];
const SENDERS_TEMPLATE = 'nochain_oldbuddy_senders';
const QUICK_COMMANDS_TEMPLATE = 'nochain_oldbuddy_quick_commands';
const MAX_MESSAGES = 5000;
const DEFAULT_REPLY_TEMPLATE = 'oldbuddy/reply.md';
const DEFAULT_SENDER = DEFAULT_SENDERS[0].text;

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
        return msg;
    }

    listMessages(limit: number, before?: string | null) {
        this.ensureLoaded();
        let list = [...this.messages];
        list.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        if (before) {
            const beforeMs = Date.parse(before);
            if (Number.isFinite(beforeMs)) {
                list = list.filter((m) => new Date(m.timestamp).getTime() < beforeMs);
            }
        }
        const slice = list.slice(-Math.max(1, limit));
        const hasMore = before
            ? list.length > slice.length
            : this.messages.length > slice.length;
        return { messages: slice, has_more: hasMore };
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

    /** 聊天对象；模板不存在或为空时返回 [{ label: 'local', text: 'local' }] */
    async parse_oldbuddy_senders(): Promise<OldBuddyLabelTextItem[]> {
        return this.parseLabelTextTemplate(SENDERS_TEMPLATE, DEFAULT_SENDERS);
    }

    async loadTargetsConfig(): Promise<OldBuddyTargetsConfig> {
        const items = await this.parse_oldbuddy_senders();
        const targets = items.map((item) => ({
            id: item.text || item.label,
            label: item.label || item.text,
        }));
        const first = items[0];
        return {
            default_target: first ? (first.text || first.label) : DEFAULT_SENDER,
            targets,
        };
    }

    /** 快捷命令；模板不存在或为空时返回 [{ label: '你是谁', text: '你是谁' }] */
    async parse_oldbuddy_quick_commands(): Promise<{ id: string; label: string; text: string }[]> {
        const items = await this.parseLabelTextTemplate(QUICK_COMMANDS_TEMPLATE, DEFAULT_QUICK_COMMANDS);
        return labelTextItemsToCommands(items);
    }

    async loadQuickCommands(): Promise<{ id: string; label: string; text: string }[]> {
        return this.parse_oldbuddy_quick_commands();
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
            target: params.target || DEFAULT_SENDER,
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
            target: params.target || DEFAULT_SENDER,
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

function normalizeLabelTextList(result: unknown): OldBuddyLabelTextItem[] {
    if (result == null || result === '') {
        return [];
    }
    let value: unknown = result;
    if (typeof value === 'string') {
        const s = value.trim();
        if (!s) return [];
        try {
            value = JSON.parse(s);
        } catch {
            return [];
        }
    }
    if (Array.isArray(value)) {
        const items = value.length === 1 && Array.isArray(value[0]) ? value[0] : value;
        return items
            .map((row: any) => ({
                label: String(row?.label ?? '').trim(),
                text: String(row?.text ?? row?.label ?? '').trim(),
            }))
            .filter((row) => row.label || row.text);
    }
    return [];
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
