import { App, Platform } from 'obsidian';
import { desktopNode, noteChainPlugin } from '../obsidian-app';
import { isRecord } from '../ts-helpers';

export interface WebRequestOptions {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    headers?: { [key: string]: string };
    body?: unknown;
    timeout?: number;
}

export interface WebResponse {
    statusCode: number;
    headers: Record<string, string | string[] | undefined>;
    body: unknown;
    text: string;
}

interface NodeHttpIncomingMessage {
    statusCode?: number;
    headers: Record<string, string | string[] | undefined>;
    on(event: 'data', listener: (chunk: unknown) => void): this;
    on(event: 'end', listener: () => void): this;
}

interface NodeClientRequest {
    on(event: 'error', listener: (error: Error) => void): this;
    on(event: 'timeout', listener: () => void): this;
    write(chunk: string | Buffer): void;
    end(): void;
    destroy(): void;
}

interface NodeHttpClient {
    request(
        options: {
            hostname?: string;
            port?: number;
            path?: string;
            method?: string;
            headers?: Record<string, string>;
            timeout?: number;
        },
        callback: (res: NodeHttpIncomingMessage) => void,
    ): NodeClientRequest;
}

export class Web {
    app: App;

    constructor(app: App) {
        this.app = app;
    }

    /**
     * 执行 HTTP 请求
     * @param urlStr 请求 URL
     * @param options 请求选项
     * @returns Promise<WebResponse>
     */
    async request(urlStr: string, options: WebRequestOptions = {}): Promise<WebResponse> {
        if (!Platform.isDesktop) {
            throw new Error('Node HTTP is only available on desktop');
        }
        const http = desktopNode<NodeHttpClient>('http');
        const https = desktopNode<NodeHttpClient>('https');
        if (!http || !https) {
            throw new Error('Node HTTP is only available on desktop');
        }
        const parsed = new URL(urlStr);
        const isHttps = parsed.protocol === 'https:';
        const client = isHttps ? https : http;
        const requestPath = `${parsed.pathname || '/'}${parsed.search}`;

        const method = options.method || 'GET';
        const headers = options.headers || {};
        const timeout = options.timeout || 30000; // 默认 30 秒

        // 如果没有设置 Content-Type，根据 body 类型自动设置
        if (method !== 'GET' && options.body && !headers['Content-Type']) {
            if (typeof options.body === 'string') {
                headers['Content-Type'] = 'text/plain; charset=utf-8';
            } else if (options.body instanceof Buffer) {
                headers['Content-Type'] = 'application/octet-stream';
            } else {
                headers['Content-Type'] = 'application/json; charset=utf-8';
                options.body = JSON.stringify(options.body);
            }
        }

        const requestOptions = {
            hostname: parsed.hostname,
            port: parsed.port ? Number(parsed.port) : (isHttps ? 443 : 80),
            path: requestPath,
            method: method,
            headers: headers,
            timeout: timeout
        };

        return new Promise((resolve, reject) => {
            const req = client.request(requestOptions, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += String(chunk);
                });

                res.on('end', () => {
                    let body: unknown = data;
                    
                    // 尝试解析 JSON
                    const contentType = res.headers['content-type'] || '';
                    if (String(contentType).includes('application/json')) {
                        try {
                            body = JSON.parse(data);
                        } catch {
                            // 解析失败，保持原样
                        }
                    }

                    const response: WebResponse = {
                        statusCode: res.statusCode || 200,
                        headers: res.headers,
                        body: body,
                        text: data
                    };

                    resolve(response);
                });
            });

            req.on('error', (error: Error) => {
                reject(error);
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            // 发送请求体
            if (method !== 'GET' && options.body) {
                if (typeof options.body === 'string' || options.body instanceof Buffer) {
                    req.write(options.body);
                } else {
                    req.write(JSON.stringify(options.body));
                }
            }

            req.end();
        });
    }

    /**
     * GET 请求
     * @param urlStr 请求 URL
     * @param options 请求选项（可选）
     * @returns Promise<WebResponse>
     */
    async get(urlStr: string, options: Omit<WebRequestOptions, 'method'> = {}): Promise<WebResponse> {
        return this.request(urlStr, { ...options, method: 'GET' });
    }

    /**
     * POST 请求
     * @param urlStr 请求 URL
     * @param body 请求体（可选）
     * @param options 请求选项（可选）
     * @returns Promise<WebResponse>
     */
    async post(urlStr: string, body?: unknown, options: Omit<WebRequestOptions, 'method' | 'body'> = {}): Promise<WebResponse> {
        return this.request(urlStr, { ...options, method: 'POST', body: body });
    }

    /**
     * PUT 请求
     * @param urlStr 请求 URL
     * @param body 请求体（可选）
     * @param options 请求选项（可选）
     * @returns Promise<WebResponse>
     */
    async put(urlStr: string, body?: unknown, options: Omit<WebRequestOptions, 'method' | 'body'> = {}): Promise<WebResponse> {
        return this.request(urlStr, { ...options, method: 'PUT', body: body });
    }

    /**
     * DELETE 请求
     * @param urlStr 请求 URL
     * @param options 请求选项（可选）
     * @returns Promise<WebResponse>
     */
    async delete(urlStr: string, options: Omit<WebRequestOptions, 'method'> = {}): Promise<WebResponse> {
        return this.request(urlStr, { ...options, method: 'DELETE' });
    }

    /**
     * PATCH 请求
     * @param urlStr 请求 URL
     * @param body 请求体（可选）
     * @param options 请求选项（可选）
     * @returns Promise<WebResponse>
     */
    async patch(urlStr: string, body?: unknown, options: Omit<WebRequestOptions, 'method' | 'body'> = {}): Promise<WebResponse> {
        return this.request(urlStr, { ...options, method: 'PATCH', body: body });
    }

    /**
     * 向啾啾协议好友推送一条消息或互动卡片（不等待点选）。
     * 字符串当正文；对象当完整协议包。仅一条连接时可省略 friendName。
     */
    async push_message(
        content: string | Record<string, unknown>,
        options: JiujiuChatOptions = {},
    ): Promise<JiujiuPushResult> {
        const packet = buildJiujiuPayload(content, options, false);
        return this.dispatchJiujiuPush(packet);
    }

    /**
     * 推一张互动卡片并等到用户点选。字符串默认是/否；也可传 card / actions。
     * 结果来自本机 `interactive_result`（与 GET /card-result 相同），不要把 callbackUrl 写成 127.0.0.1。
     */
    async ask_message(
        content: string | Record<string, unknown>,
        options: JiujiuChatOptions = {},
    ): Promise<Record<string, unknown>> {
        const packet = buildJiujiuPayload(content, options, true);
        const pushed = await this.dispatchJiujiuPush(packet);
        const msgId = pushed.msgId;
        const timeoutSec = options.timeout ?? 120;
        const deadline = Date.now() + timeoutSec * 1000;
        while (Date.now() < deadline) {
            const found = findCardAnswer(this.jiujiuStore().listJiujiuCardResults(), msgId);
            if (found) return found;
            await sleepMs(400);
        }
        throw new Error(`等待卡片结果超时：${msgId}`);
    }

    private dispatchJiujiuPush(packet: Record<string, unknown>): Promise<JiujiuPushResult> {
        return this.jiujiuStore().pushJiujiu(packet);
    }

    private jiujiuStore(): {
        pushJiujiu(packet: Record<string, unknown>): Promise<JiujiuPushResult>;
        listJiujiuCardResults(): Record<string, unknown>[];
    } {
        if (!Platform.isDesktop) {
            throw new Error('啾啾推送仅桌面可用');
        }
        const server = noteChainPlugin(this.app)?.httpServer;
        if (!server) {
            throw new Error('HTTP 服务未启动，无法推送到啾啾');
        }
        return server;
    }

    /**
     * 解析 URL。
     * `strict` 为 true 时，`urlStr` 整段必须是完整绝对 URL（中间不能有空白或换行）。
     * `strict` 为 false 时，从文本中按空白截取 `http://` / `https://` 开头的 URL；只有一个返回字符串，多个返回数组。不存在时返回 null。
     */
    parse_url(urlStr: string, strict?: true): string | null;
    parse_url(urlStr: string, strict: false): string | string[] | null;
    parse_url(urlStr: string, strict = true): string | string[] | null {
        if (strict) {
            return asAbsoluteUrl(urlStr.trim());
        }
        const urls = extractHttpUrls(urlStr);
        if (urls.length === 0) {
            return null;
        }
        if (urls.length === 1) {
            return urls[0];
        }
        return urls;
    }
}

export interface JiujiuChatOptions {
    friendName?: string;
    friend?: string;
    friendId?: string;
    target?: string;
    senderName?: string;
    sender?: string;
    senderId?: string;
    /** ask_message 等待秒数，默认 120 */
    timeout?: number;
    actions?: unknown[];
    card?: Record<string, unknown>;
    fields?: unknown[];
    title?: string;
    reply?: string;
    callbackUrl?: string;
}

export interface JiujiuPushResult {
    ok: true;
    clients: number;
    msgId: string;
    friendName?: string;
    friendId?: string;
}

function looksLikeCardPayload(data: Record<string, unknown>): boolean {
    if (data.card || data.actions || data.fields) return true;
    const content = data.content;
    if (!isRecord(content)) return false;
    return !!(content.card || content.actions || content.fields || content.title || content.description);
}

function isInteractiveType(msgType: unknown): boolean {
    const t = String(msgType || '').trim().toLowerCase();
    return t === 'interactive' || t === 'card' || t === 'form' || t === 'ui' || t === 'interactive_card';
}

function buildJiujiuPayload(
    content: string | Record<string, unknown>,
    options: JiujiuChatOptions,
    ask: boolean,
): Record<string, unknown> {
    const packet: Record<string, unknown> = isRecord(content) ? { ...content } : { content };
    if (typeof content === 'string') {
        packet.content = content;
    }
    const friendName = String(options.friendName ?? options.friend ?? packet.friendName ?? packet.friend ?? '').trim();
    const friendId = String(options.friendId ?? packet.friendId ?? '').trim();
    const target = String(options.target ?? packet.target ?? '').trim();
    const senderName = String(options.senderName ?? options.sender ?? packet.senderName ?? '').trim();
    const senderId = String(options.senderId ?? packet.senderId ?? '').trim();
    if (friendName) packet.friendName = friendName;
    if (friendId) packet.friendId = friendId;
    if (target) packet.target = target;
    if (senderName) packet.senderName = senderName;
    if (senderId) packet.senderId = senderId;
    if (options.card) packet.card = options.card;
    if (options.actions) packet.actions = options.actions;
    if (options.fields) packet.fields = options.fields;
    if (options.title) packet.title = options.title;
    if (options.reply) packet.reply = options.reply;
    if (options.callbackUrl) packet.callbackUrl = options.callbackUrl;

    const interactive = ask || isInteractiveType(packet.type) || looksLikeCardPayload(packet);
    if (interactive) {
        if (!packet.type) packet.type = 'interactive';
        if (!packet.reply) packet.reply = 'both';
        if (!packet.card && !packet.actions && !packet.fields && !looksLikeCardPayload(packet)) {
            packet.actions = [
                { id: 'yes', label: '是' },
                { id: 'no', label: '否' },
            ];
        }
        if (packet.content == null || packet.content === '') {
            packet.content = String(packet.title || '请选择');
        }
    } else if (!packet.type) {
        packet.type = 'message';
    }
    return packet;
}

function findCardAnswer(results: Record<string, unknown>[], msgId: string): Record<string, unknown> | null {
    const want = String(msgId);
    for (let i = results.length - 1; i >= 0; i--) {
        const row = results[i];
        const replyTo = String(row.replyTo ?? row.inReplyTo ?? '');
        if (replyTo === want) return row;
    }
    return null;
}

function sleepMs(ms: number): Promise<void> {
    return new Promise((resolve) => {
        window.setTimeout(resolve, ms);
    });
}

function asAbsoluteUrl(urlStr: string): string | null {
    if (!urlStr || /\s/.test(urlStr)) {
        return null;
    }
    try {
        const parsed = new URL(urlStr);
        if (!parsed.protocol || parsed.protocol === ':') {
            return null;
        }
        if (
            (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
            !parsed.hostname
        ) {
            return null;
        }
        return parsed.href;
    } catch {
        return null;
    }
}

function extractHttpUrls(text: string): string[] {
    const urls: string[] = [];
    const seen = new Set<string>();
    const re = /https?:\/\/[^\s]+/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
        const raw = match[0].replace(/[.,;:!?)]+$/, '');
        if (!raw || seen.has(raw)) {
            continue;
        }
        seen.add(raw);
        urls.push(raw);
    }
    return urls;
}

