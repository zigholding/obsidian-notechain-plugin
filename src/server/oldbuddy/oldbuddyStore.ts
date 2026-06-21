let fs = require('fs');
let path = require('path');
let crypto = require('crypto');

import { OldBuddyMessage, OldBuddyTargetsConfig } from './types';
import { OldBuddyWebSocketHub } from './oldbuddyWebSocket';
import { Templater } from '../../easyapi/templater';

const DEFAULT_TARGETS: OldBuddyTargetsConfig = {
    default_target: 'legacy',
    targets: [
        { id: 'legacy', label: '本地', switch_phrases: ['切换到本地', '本地模式'] },
        { id: 'nanobot_channel', label: 'nanobot channel', switch_phrases: ['nanobot'] },
        { id: 'hermes_channel', label: 'hermes channel', switch_phrases: ['hermes'] },
        { id: 'nanobot_serve', label: 'nanobot serve' },
        { id: 'openclaw', label: 'openclaw', switch_phrases: ['openclaw'] },
    ],
};

const MAX_MESSAGES = 5000;
const DEFAULT_REPLY_TEMPLATE = 'oldbuddy/reply.md';

/** 默认快捷命令（原 quick_commands.yaml） */
const DEFAULT_QUICK_COMMANDS: { id: string; label: string; text: string }[] = [
    { id: '0', label: '你是谁', text: '你是谁' },
    { id: '1', label: '站起来', text: '站起来' },
    { id: '2', label: '打开避障', text: '打开避障' },
    { id: '3', label: '关闭避障', text: '关闭避障' },
    { id: '4', label: '往前走2米', text: '往前走2米' },
    { id: '5', label: '你看到什么了', text: '你看到什么了' },
    { id: '6', label: '前往消防巡逻', text: '前往消防巡逻' },
    { id: '7', label: '站起来往前走1米', text: '站起来往前走1米' },
    { id: '8', label: '连续动作', text: '后退两米然后拍照然后趴下' },
    { id: '9', label: '在灭火器设定初始位姿', text: '在灭火器设定初始位姿' },
    { id: '10', label: '在洗手台设定初始位姿', text: '在洗手台设定初始位姿' },
];

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

    loadTargetsConfig(): OldBuddyTargetsConfig {
        const cfg: OldBuddyTargetsConfig = {
            default_target: DEFAULT_TARGETS.default_target,
            targets: [...DEFAULT_TARGETS.targets],
        };
        try {
            const targetsYaml = path.join(this.dataDir, 'targets.yaml');
            if (fs.existsSync(targetsYaml)) {
                const yaml = require('js-yaml');
                const parsed = yaml.load(fs.readFileSync(targetsYaml, 'utf8'));
                if (parsed?.targets) {
                    cfg.targets = parsed.targets;
                    cfg.default_target = parsed.default_target || cfg.default_target;
                }
            }
        } catch {
            // use defaults
        }
        return cfg;
    }

    loadQuickCommands(): { id: string; label: string; text: string }[] {
        try {
            const yamlFile = path.join(this.dataDir, 'quick_commands.yaml');
            if (fs.existsSync(yamlFile)) {
                const yaml = require('js-yaml');
                const parsed = yaml.load(fs.readFileSync(yamlFile, 'utf8'));
                if (Array.isArray(parsed)) {
                    return parsed.map((row: any, i: number) => ({
                        id: String(row?.id || i),
                        label: String(row?.label || row?.text || row),
                        text: String(row?.text || row?.label || row),
                    }));
                }
                if (parsed && typeof parsed === 'object') {
                    return Object.entries(parsed).map(([label, text], i) => ({
                        id: String(i),
                        label: String(label),
                        text: String(text),
                    }));
                }
            }
        } catch (e) {
            console.warn('[oldbuddy] quick_commands.yaml parse failed:', e);
        }
        return [...DEFAULT_QUICK_COMMANDS];
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
            target: params.target || 'legacy',
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
            target: params.target || 'legacy',
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
        const targets = this.loadTargetsConfig();
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
