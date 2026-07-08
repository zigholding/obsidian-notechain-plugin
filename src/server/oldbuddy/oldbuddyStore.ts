let fs = require('fs');
let path = require('path');
let crypto = require('crypto');

import { OldBuddyMessage, OldBuddyTargetsConfig, OldBuddyLabelTextItem, OldBuddyAvatarMap, isUserSender } from './types';
import { OldBuddyWebSocketHub } from './oldbuddyWebSocket';
import { Templater } from '../../easyapi/templater';

const DEFAULT_TARGETS: OldBuddyLabelTextItem[] = [{ label: 'local', text: 'local' }];
const DEFAULT_QUICK_COMMANDS: OldBuddyLabelTextItem[] = [{ label: '你是谁', text: '你是谁' }];
const TARGETS_TEMPLATE = 'nochain_oldbuddy_targets';
const QUICK_COMMANDS_TEMPLATE = 'nochain_oldbuddy_quick_commands';
const QUERY_TEMPLATE = 'nochain_oldbuddy_query';
const SAVE_TEMPLATE = 'nochain_oldbuddy_save';
const REFERENCE_TEMPLATE = 'nochain_oldbuddy_reference';
const TAGS_TEMPLATE = 'nochain_oldbuddy_tags';
const AVATAR_TEMPLATE = 'nochain_oldbuddy_avatar';
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
    /** save 模板返回 true 的消息 id 不写入 messages.json（仅 vault/日志） */
    private vaultOnlyMessageIds = new Set<string>();

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
            const payload = this.messages.filter((m) => !this.vaultOnlyMessageIds.has(m.id));
            fs.writeFileSync(this.messagesFile, JSON.stringify(payload, null, 2), 'utf8');
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
        this.ws.broadcast(msg);
        if (!this.templater.ea.file.get_tfile(SAVE_TEMPLATE)) {
            this.persist();
        } else {
            void this.afterPushMessage(msg);
        }
        return msg;
    }

    /** save 模板返回 true 时标记为仅 vault，不写 messages.json */
    private async afterPushMessage(msg: OldBuddyMessage) {
        const skipJson = await this.saveMessageViaScript(msg);
        if (skipJson) {
            this.vaultOnlyMessageIds.add(msg.id);
        } else {
            this.vaultOnlyMessageIds.delete(msg.id);
        }
        this.persist();
    }

    /** 可选：nochain_oldbuddy_save；返回 true 表示已写入 vault，跳过 messages.json */
    private async saveMessageViaScript(msg: OldBuddyMessage): Promise<boolean> {
        const result = await this.invokeTemplaterOptional(SAVE_TEMPLATE, {
            oldbuddy: {
                action: 'save',
                message: msg,
                messages: this.messages,
                data_dir: this.dataDir,
                messages_file: this.messagesFile,
            },
        });
        return isTemplaterTrue(result);
    }

    async listMessages(limit: number, before?: string | null, target?: string | null) {
        this.ensureLoaded();
        const pageSize = Math.max(1, limit);
        const fetchSize = pageSize + 1;
        let list = [...this.messages];
        const queried = await this.queryMessagesViaScript({
            limit: fetchSize,
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
        const hasMore = list.length > pageSize;
        const messages = list.slice(-pageSize);
        return { messages, has_more: hasMore };
    }

    /** 可选：nochain_oldbuddy_query，返回 OldBuddyMessage[] 或 { messages: [] }，与本地记录合并 */
    private async queryMessagesViaScript(params: {
        limit: number;
        before: string | null;
        target: string | null;
        local: OldBuddyMessage[];
    }): Promise<OldBuddyMessage[] | null> {
        const extra = {
            oldbuddy: {
                action: 'query',
                limit: params.limit,
                before: params.before,
                target: params.target,
                messages: params.local,
                data_dir: this.dataDir,
                messages_file: this.messagesFile,
            },
        };
        const result = await this.invokeTemplaterOptional(QUERY_TEMPLATE, extra);
        let messages = normalizeMessages(result);
        if (!messages && this.templater.ea.file.get_tfile(QUERY_TEMPLATE)) {
            messages = await this.queryJournalMessagesFallback(params);
        }
        return messages?.length ? messages : null;
    }

    /** Templater 未返回有效结果时，直接从日志 infield 读取（与 nochain_oldbuddy_query 默认逻辑一致） */
    private async queryJournalMessagesFallback(params: {
        limit: number;
        before: string | null;
        target: string | null;
    }): Promise<OldBuddyMessage[] | null> {
        const ea = this.templater.ea;
        const app = this.templater.app;
        const dailyRe = /^\d{4}-\d{2}-\d{2}$/;
        const maxDays = 120;
        const limit = Math.max(1, Math.min(500, params.limit || 10));
        const before = params.before;
        const targetFilter = params.target;

        const msgTime = (m: OldBuddyMessage) => {
            const t = Date.parse(String(m.timestamp || ''));
            return Number.isFinite(t) ? t : 0;
        };

        const fieldsToMessage = (f: Record<string, string>, dateFallback: string): OldBuddyMessage | null => {
            if (!f.id) return null;
            return {
                id: String(f.id),
                sender: String(f.sender || 'user'),
                target: String(f.target || DEFAULT_TARGET),
                timestamp: f.timestamp ? String(f.timestamp) : `${dateFallback}T00:00:00.000Z`,
                type: (String(f.type || 'text') as OldBuddyMessage['type']),
                content: f.content != null ? String(f.content) : '',
                extra_text: f.extra_text ? String(f.extra_text) : undefined,
                file_name: f.file_name ? String(f.file_name) : undefined,
                file_size:
                    f.file_size != null && Number.isFinite(Number(f.file_size))
                        ? Number(f.file_size)
                        : undefined,
                card: f.card === 'true',
            };
        };

        let dailies = app.vault
            .getMarkdownFiles()
            .filter((f) => dailyRe.test(f.basename))
            .sort((a, b) => a.basename.localeCompare(b.basename));

        if (before) {
            const day = before.slice(0, 10);
            if (dailyRe.test(day)) {
                dailies = dailies.filter((f) => f.basename <= day);
            }
        }
        if (dailies.length > maxDays) {
            dailies = dailies.slice(-maxDays);
        }

        const messages: OldBuddyMessage[] = [];
        for (const tfile of dailies) {
            let content = '';
            try {
                content = await app.vault.cachedRead(tfile);
            } catch {
                continue;
            }
            const meta = app.metadataCache.getFileCache(tfile);
            if (!meta?.listItems) continue;
            for (const li of meta.listItems) {
                const line = ea.editor.slice_by_position(content, li.position);
                if (!/\bid::/.test(line)) continue;
                if (!/\(s::ob\)|\[s:: ob\]|\[s::ob\]/.test(line)) continue;
                const f = ea.editor.parse_list_dataview(line);
                const m = fieldsToMessage(f, tfile.basename);
                if (m && typeof m.content === 'string') {
                    messages.push(m);
                }
            }
        }

        messages.sort((a, b) => msgTime(a) - msgTime(b));
        let list = messages;
        if (targetFilter) {
            list = list.filter((m) => (m.target || DEFAULT_TARGET) === targetFilter);
        }
        if (before) {
            const beforeMs = Date.parse(before);
            if (Number.isFinite(beforeMs)) {
                list = list.filter((m) => msgTime(m) < beforeMs);
            }
            list = list.slice(-(limit + 1));
        } else {
            const cap = Math.min(500, Math.max(limit * 5, limit));
            list = list.slice(-cap);
        }
        return list.length ? list : null;
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
        const mimeNorm = String(mime || '').trim();
        if (mimeNorm && mimeNorm !== 'application/octet-stream') {
            fs.writeFileSync(`${abs}.mime`, mimeNorm, 'utf8');
        }
        return { fname, abs, url: `/oldbuddy/uploads/${encodeURIComponent(fname)}` };
    }

    serveUploadFile(fname: string): { data: Buffer; mime: string } | null {
        const meta = this.serveUploadMeta(fname);
        if (!meta) return null;
        return { data: fs.readFileSync(meta.abs), mime: meta.mime };
    }

    serveUploadMeta(fname: string): { abs: string; size: number; mime: string; mtime: number } | null {
        this.ensureLoaded();
        const safe = path.basename(fname);
        if (!safe || safe.includes('..')) return null;
        const abs = path.join(this.uploadsDir, safe);
        if (!fs.existsSync(abs)) return null;
        const stat = fs.statSync(abs);
        const mimeSidecar = `${abs}.mime`;
        const mime = fs.existsSync(mimeSidecar)
            ? fs.readFileSync(mimeSidecar, 'utf8').trim()
            : mimeFromExt(abs);
        return {
            abs,
            size: stat.size,
            mime,
            mtime: stat.mtimeMs,
        };
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

    /** @ 引用列表；模板 nochain_oldbuddy_reference 返回 [{ label, text }, ...] */
    async loadReferences(target?: string, query?: string): Promise<{ id: string; label: string; text: string }[]> {
        if (!this.templater.ea.file.get_tfile(REFERENCE_TEMPLATE)) {
            return [];
        }
        try {
            const result = await this.templater.parse_templater(REFERENCE_TEMPLATE, true, {
                oldbuddy: {
                    action: 'reference',
                    target: target || null,
                    query: query || '',
                },
            }, 0, '');
            const items = normalizeLabelTextList(result);
            if (!items.length) {
                return [];
            }
            let list = labelTextItemsToCommands(items);
            const q = (query || '').trim().toLowerCase();
            if (q) {
                list = list.filter(
                    (item) =>
                        item.label.toLowerCase().includes(q) ||
                        item.text.toLowerCase().includes(q),
                );
            }
            return list;
        } catch (e) {
            console.warn('[oldbuddy] reference failed:', e);
            return [];
        }
    }

    /** # 标签列表；模板 nochain_oldbuddy_tags 返回 [{ label, text }, ...] */
    async loadTags(target?: string, query?: string): Promise<{ id: string; label: string; text: string }[]> {
        if (!this.templater.ea.file.get_tfile(TAGS_TEMPLATE)) {
            return [];
        }
        try {
            const result = await this.templater.parse_templater(TAGS_TEMPLATE, true, {
                oldbuddy: {
                    action: 'tags',
                    target: target || null,
                    query: query || '',
                },
            }, 0, '');
            const items = normalizeLabelTextList(result);
            if (!items.length) {
                return [];
            }
            let list = labelTextItemsToCommands(items);
            const q = (query || '').trim().toLowerCase();
            if (q) {
                list = list.filter(
                    (item) =>
                        item.label.toLowerCase().includes(q) ||
                        item.text.toLowerCase().includes(q),
                );
            }
            return list;
        } catch (e) {
            console.warn('[oldbuddy] tags failed:', e);
            return [];
        }
    }

    /** 头像/昵称；模板 nochain_oldbuddy_avatar 返回 { user: ['我','a.png'], buddy: ['你','b.png'], ... } */
    async loadAvatars(target?: string): Promise<OldBuddyAvatarMap> {
        if (!this.templater.ea.file.get_tfile(AVATAR_TEMPLATE)) {
            return {};
        }
        try {
            const result = await this.templater.parse_templater(AVATAR_TEMPLATE, true, {
                oldbuddy: {
                    action: 'avatar',
                    target: target || null,
                },
            }, 0, '');
            return normalizeAvatarMap(result);
        } catch (e) {
            console.warn('[oldbuddy] avatar failed:', e);
            return {};
        }
    }

    async readVaultAsset(relPath: string): Promise<{ data: Buffer; mime: string } | null> {
        const safe = String(relPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
        if (!safe || safe.includes('..')) {
            return null;
        }
        const tfile = this.templater.ea.file.get_tfile(safe);
        if (!tfile) {
            return null;
        }
        try {
            const data = await this.templater.app.vault.readBinary(tfile);
            return { data: Buffer.from(data), mime: mimeFromExt(tfile.path) };
        } catch {
            return null;
        }
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

        if (!params.skipReply && isUserSender(params.sender || 'user')) {
            await this.generateReply(userMsg, params.quick_cmd_id);
        }
        return userMsg;
    }

    async addFileMessage(params: {
        type: 'image' | 'audio' | 'video' | 'file';
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
        if (isUserSender(params.sender || 'user')) {
            await this.generateReply(userMsg);
        }
        return userMsg;
    }

    /** 第三方 HTTP 推送；sender 为 user 时默认触发 reply（与页面发消息一致） */
    async pushExternalMessage(params: {
        content: string;
        sender?: string;
        target?: string;
        type?: OldBuddyMessage['type'];
        extra_text?: string;
        file_name?: string;
        file_size?: number;
        card?: boolean | string | number;
        id?: string;
        timestamp?: string;
        skip_reply?: boolean | string;
        quick_cmd_id?: string;
    }): Promise<OldBuddyMessage> {
        this.ensureLoaded();
        const content = String(params.content ?? '').trim();
        if (!content) {
            throw new Error('content required');
        }
        const type = params.type || 'text';
        if (!['text', 'image', 'audio', 'video', 'file'].includes(type)) {
            throw new Error('invalid type');
        }
        const id = String(params.id || '').trim() || this.newId();
        const existing = this.messages.findIndex((m) => m.id === id);
        const msg: OldBuddyMessage = {
            id,
            sender: params.sender || 'buddy',
            target: params.target || DEFAULT_TARGET,
            timestamp: params.timestamp || new Date().toISOString(),
            type,
            content,
        };
        if (params.extra_text != null && String(params.extra_text).trim()) {
            msg.extra_text = String(params.extra_text);
        }
        if (params.file_name != null && String(params.file_name).trim()) {
            msg.file_name = String(params.file_name);
        }
        if (params.file_size != null && Number.isFinite(Number(params.file_size))) {
            msg.file_size = Number(params.file_size);
        }
        if (params.card === true || params.card === 'true' || params.card === 1) {
            msg.card = true;
        }
        let userMsg: OldBuddyMessage;
        if (existing >= 0) {
            this.messages[existing] = msg;
            if (this.messages.length > MAX_MESSAGES) {
                this.messages = this.messages.slice(-MAX_MESSAGES);
            }
            this.ws.broadcast(msg);
            if (!this.templater.ea.file.get_tfile(SAVE_TEMPLATE)) {
                this.persist();
            } else {
                void this.afterPushMessage(msg);
            }
            userMsg = msg;
        } else {
            userMsg = this.pushMessage(msg);
        }
        const skipReply = params.skip_reply === true || params.skip_reply === 'true';
        if (!skipReply && isUserSender(params.sender || 'buddy')) {
            await this.generateReply(userMsg, params.quick_cmd_id);
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
            if (isTemplaterTrue(result)) {
                return;
            }
            if (typeof result === 'string' && result.trim()) {
                replyText = result.trim();
            } else if (Array.isArray(result) && result[0] != null && String(result[0]).trim()) {
                replyText = String(result[0]).trim();
            }
        } catch (e) {
            console.warn('[oldbuddy] templater reply failed:', e);
        }

        if (isTemplaterTrue(replyText)) {
            return;
        }

        if (!replyText) {
            if (userMsg.type === 'text') {
                replyText = `嗯，我听到了：${userMsg.content}`;
            } else if (userMsg.type === 'image') {
                replyText = '收到你的图片了。';
            } else if (userMsg.type === 'audio') {
                replyText = '收到你的语音了。';
            } else if (userMsg.type === 'video') {
                replyText = '收到你的视频了。';
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

function isTemplaterTrue(result: unknown): boolean {
    const value = unwrapTemplaterValue(result);
    if (value === true || value === 1) {
        return true;
    }
    if (typeof value === 'string') {
        const s = value.trim().toLowerCase();
        return s === 'true' || s === '1';
    }
    return false;
}

function normalizeAvatarMap(result: unknown): OldBuddyAvatarMap {
    const value = unwrapTemplaterValue(result);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    const out: OldBuddyAvatarMap = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        const id = String(key).trim();
        if (!id) continue;
        if (Array.isArray(val) && val.length >= 1) {
            out[id] = {
                id,
                name: String(val[0] ?? id).trim() || id,
                avatar: val.length >= 2 ? String(val[1] ?? '').trim() : '',
            };
            continue;
        }
        if (val && typeof val === 'object') {
            const row = val as Record<string, unknown>;
            const name = String(row.name ?? row.label ?? row.nickname ?? id).trim() || id;
            const avatar = String(row.avatar ?? row.img ?? row.text ?? '').trim();
            out[id] = { id, name, avatar };
        }
    }
    return out;
}

function unwrapTemplaterValue(result: unknown): unknown {
    if (result == null || result === '') {
        return null;
    }
    let value: unknown = result;

    if (Array.isArray(value)) {
        if (value.length === 1 && Array.isArray(value[0])) {
            return value[0];
        }
        if (value.length === 1 && typeof value[0] === 'string') {
            value = value[0];
        } else if (value.length > 0 && value.every((row) => row && typeof row === 'object')) {
            return value;
        }
    }

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
    if (mime.includes('quicktime')) return '.mov';
    if (mime.includes('mp4') || mime.includes('x-m4v')) return '.mp4';
    if (mime.includes('3gpp')) return '.3gp';
    if (mime.includes('webm')) return '.webm';
    if (mime.includes('ogg')) return '.ogg';
    if (mime.includes('mpeg') || mime.includes('mp3')) return '.mp3';
    if (mime.includes('wav')) return '.wav';
    return '';
}

/** 根据 MIME / 扩展名纠正消息类型（如相机录像误走 audio 接口） */
export function inferOldBuddyMessageType(
    declared: 'image' | 'audio' | 'video' | 'file',
    mime: string,
    filename: string,
): 'image' | 'audio' | 'video' | 'file' {
    const m = String(mime || '').toLowerCase();
    const ext = path.extname(String(filename || '')).toLowerCase();
    const videoExt = new Set(['.mp4', '.mov', '.m4v', '.mkv', '.3gp', '.avi']);
    const audioExt = new Set(['.m4a', '.mp3', '.wav', '.ogg', '.aac', '.amr', '.caf']);

    if (m.startsWith('video/') || videoExt.has(ext)) {
        return 'video';
    }
    if (m.startsWith('audio/') || audioExt.has(ext)) {
        return 'audio';
    }
    if (m.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
        return 'image';
    }
    if (ext === '.webm') {
        if (m.startsWith('audio/')) return 'audio';
        if (m.startsWith('video/')) return 'video';
        if (declared === 'audio' || declared === 'video') return declared;
        return 'video';
    }
    return declared;
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
        '.mp4': 'video/mp4',
        '.mov': 'video/quicktime',
        '.m4v': 'video/mp4',
        '.mkv': 'video/x-matroska',
        '.3gp': 'video/3gpp',
        '.webm': 'video/webm',
        '.ogg': 'audio/ogg',
        '.mp3': 'audio/mpeg',
        '.m4a': 'audio/mp4',
        '.wav': 'audio/wav',
        '.aac': 'audio/aac',
        '.amr': 'audio/amr',
        '.caf': 'audio/x-caf',
        '.yaml': 'text/yaml; charset=utf-8',
        '.yml': 'text/yaml; charset=utf-8',
        '.md': 'text/markdown; charset=utf-8',
    };
    return map[ext] || 'application/octet-stream';
}
