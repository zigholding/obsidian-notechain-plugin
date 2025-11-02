import { App } from 'obsidian';

const http = require('http');
const https = require('https');
const url = require('url');

export interface WebRequestOptions {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    headers?: { [key: string]: string };
    body?: any;
    timeout?: number;
}

export interface WebResponse {
    statusCode: number;
    headers: { [key: string]: string };
    body: any;
    text: string;
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
        // 解析 URL 并正确处理编码
        const parsed = url.parse(urlStr);
        const isHttps = parsed.protocol === 'https:';
        const client = isHttps ? https : http;

        // 处理路径和查询字符串的编码
        let requestPath = parsed.pathname || '/';
        
        // 处理查询字符串，确保中文字符被正确编码
        if (parsed.query || parsed.search) {
            let queryString = '';
            if (parsed.search) {
                // 解析查询字符串并重新编码
                const queryParams = new URLSearchParams(parsed.search.substring(1));
                queryString = '?' + queryParams.toString();
            } else if (parsed.query) {
                // 手动处理查询字符串
                const parts: string[] = [];
                const queryPairs = parsed.query.split('&');
                for (const pair of queryPairs) {
                    const [key, ...valueParts] = pair.split('=');
                    const value = valueParts.join('=');
                    // 对键和值进行编码（如果还没有编码）
                    const encodedKey = encodeURIComponent(decodeURIComponent(key || ''));
                    const encodedValue = encodeURIComponent(decodeURIComponent(value || ''));
                    parts.push(`${encodedKey}=${encodedValue}`);
                }
                queryString = '?' + parts.join('&');
            }
            requestPath = requestPath + queryString;
        }

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

        const requestOptions: any = {
            hostname: parsed.hostname,
            port: parsed.port || (isHttps ? 443 : 80),
            path: requestPath,
            method: method,
            headers: headers,
            timeout: timeout
        };

        return new Promise((resolve, reject) => {
            const req = client.request(requestOptions, (res: any) => {
                let data = '';

                res.on('data', (chunk: Buffer) => {
                    data += chunk.toString();
                });

                res.on('end', () => {
                    let body: any = data;
                    
                    // 尝试解析 JSON
                    const contentType = res.headers['content-type'] || '';
                    if (contentType.includes('application/json')) {
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
    async post(urlStr: string, body?: any, options: Omit<WebRequestOptions, 'method' | 'body'> = {}): Promise<WebResponse> {
        return this.request(urlStr, { ...options, method: 'POST', body: body });
    }

    /**
     * PUT 请求
     * @param urlStr 请求 URL
     * @param body 请求体（可选）
     * @param options 请求选项（可选）
     * @returns Promise<WebResponse>
     */
    async put(urlStr: string, body?: any, options: Omit<WebRequestOptions, 'method' | 'body'> = {}): Promise<WebResponse> {
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
    async patch(urlStr: string, body?: any, options: Omit<WebRequestOptions, 'method' | 'body'> = {}): Promise<WebResponse> {
        return this.request(urlStr, { ...options, method: 'PATCH', body: body });
    }
}

