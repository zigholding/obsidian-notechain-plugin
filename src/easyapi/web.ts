import { App, Platform } from 'obsidian';
import { desktopNode, noteChainPlugin } from '../obsidian-app';

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
     * 向网页 OldBuddy 推送消息（与 `POST /oldbuddy/push_message` 相同，走内存不绕 HTTP）。
     * 字符串会包成 `{ content, sender: 'buddy', target: 'local', skip_reply: true }`。
     * 对象缺省同样：`sender` 为 buddy、`target` 为 local、`skip_reply` 为 true。
     */
    async push_message(data: string | Record<string, unknown>): Promise<OldBuddyPushResult> {
        return this.chatServer().pushOldBuddy(asOldBuddyPushFields(data));
    }

    /**
     * 向网页 OldBuddy 推送协议 JSON，并等到 `interactive_result`（按 msgId / replyTo）。
     * 网站卡请用 `push_message`。`timeout` 为秒，默认 120。
     */
    async ask_message(
        data: string | Record<string, unknown>,
        timeout = 120,
    ): Promise<Record<string, unknown>> {
        const fields = asOldBuddyPushFields(data);
        const pushed = await this.chatServer().pushOldBuddy(fields);
        if (isWebsitePushData(fields) || isWebsitePushData(pushed.message)) {
            return { ...pushed, type: String(fields.type || pushed.message.type || 'website') };
        }
        const msgId = String(pushed.message.msgId || pushed.message.id || '');
        if (!msgId) {
            throw new Error('等待卡片结果失败：缺少 msgId');
        }
        return this.waitForCardAnswer(msgId, timeout);
    }

    /**
     * 向啾啾协议好友推送 App 协议 JSON，不做卡片字段解析。
     * 字符串会包成 `{ type: 'message', content }`。仅一条连接时可省略 friendName。
     * `senderName` 显示在手机气泡上。
     */
    async push_message_jiujiu(
        friendName: string,
        data: string | Record<string, unknown>,
        senderName?: string,
    ): Promise<JiujiuPushResult> {
        return this.dispatchJiujiuPush(asJiujiuPushData(friendName, data, senderName));
    }

    /**
     * 推送协议 JSON 并等到 `interactive_result`（按 msgId）。网站卡请用 `push_message_jiujiu`。
     * `timeout` 为秒，默认 120。
     */
    async ask_message_jiujiu(
        friendName: string,
        data: string | Record<string, unknown>,
        timeout = 120,
    ): Promise<Record<string, unknown>> {
        const packet = asJiujiuPushData(friendName, data);
        const pushed = await this.dispatchJiujiuPush(packet);
        if (isWebsitePushData(packet)) {
            return { ...pushed, type: String(packet.type || 'website') };
        }
        const msgId = pushed.msgId;
        return this.waitForCardAnswer(msgId, timeout);
    }

    private async waitForCardAnswer(msgId: string, timeout: number): Promise<Record<string, unknown>> {
        const deadline = Date.now() + timeout * 1000;
        while (Date.now() < deadline) {
            const found = findCardAnswer(this.chatServer().listJiujiuCardResults(), msgId);
            if (found) return found;
            await sleepMs(400);
        }
        throw new Error(`等待卡片结果超时：${msgId}`);
    }

    private dispatchJiujiuPush(packet: Record<string, unknown>): Promise<JiujiuPushResult> {
        return this.chatServer().pushJiujiu(packet);
    }

    private chatServer(): {
        pushJiujiu(packet: Record<string, unknown>): Promise<JiujiuPushResult>;
        listJiujiuCardResults(): Record<string, unknown>[];
        pushOldBuddy(fields: Record<string, unknown>): Promise<OldBuddyPushResult>;
    } {
        if (!Platform.isDesktop) {
            throw new Error('OldBuddy / 啾啾推送仅桌面可用');
        }
        const server = noteChainPlugin(this.app)?.httpServer;
        if (!server) {
            throw new Error('HTTP 服务未启动，无法推送');
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

export interface JiujiuPushResult {
    ok: true;
    clients: number;
    msgId: string;
    friendName?: string;
    friendId?: string;
}

export interface OldBuddyPushResult {
    ok: true;
    message: Record<string, unknown>;
}

function asOldBuddyPushFields(data: string | Record<string, unknown>): Record<string, unknown> {
    if (typeof data === 'string') {
        return { content: data, sender: 'buddy', target: 'local', skip_reply: true };
    }
    const fields = { ...data };
    if (fields.sender == null && fields.senderId == null) fields.sender = 'buddy';
    if (fields.target == null) fields.target = 'local';
    if (fields.skip_reply == null) fields.skip_reply = true;
    return fields;
}

function asJiujiuPushData(
    friendName: string,
    data: string | Record<string, unknown>,
    senderName?: string,
): Record<string, unknown> {
    const packet: Record<string, unknown> = typeof data === 'string'
        ? { type: 'message', content: data }
        : { ...data };
    const name = String(friendName || packet.friendName || packet.friend || '').trim();
    if (name) packet.friendName = name;
    const sender = String(senderName || packet.senderName || packet.sender || '').trim();
    if (sender) packet.senderName = sender;
    return packet;
}

function isWebsitePushData(packet: Record<string, unknown>): boolean {
    const t = String(packet.type || '').trim().toLowerCase();
    return t === 'website' || t === 'web' || t === 'lookup' || t === 'sites'
        || Array.isArray(packet.urls) || Array.isArray(packet.tabs);
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

