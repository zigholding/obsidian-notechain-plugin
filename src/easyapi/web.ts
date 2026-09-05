import { App, Platform } from 'obsidian';
import { desktopNode } from '../obsidian-app';

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
}

