import { App } from 'obsidian';
import { Templater } from './easyapi/templater';

const http = require('http');
const url = require('url');

export class HTTPServer {
    private app: App;
    private templater: Templater;
    private server: any = null;
    private port: number;

    constructor(app: App, templater: Templater, port: number = 3000) {
        this.app = app;
        this.templater = templater;
        this.port = port;
    }

    start(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.server) {
                console.log('HTTP Server is already running');
                resolve();
                return;
            }

            // 确保之前没有残留的服务器实例
            if (this.server && this.server.listening) {
                this.server.close();
            }

            this.server = http.createServer(async (req:any, res:any) => {
                // 设置 CORS 头
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

                // 处理 OPTIONS 预检请求
                if (req.method === 'OPTIONS') {
                    res.writeHead(200);
                    res.end();
                    return;
                }

                try {
                    const parsedUrl = url.parse(req.url || '', true);
                    
                    if (parsedUrl.pathname === '/templater' && (req.method === 'GET' || req.method === 'POST')) {
                        await this.handleTemplaterRequest(req, res, parsedUrl);
                    } else {
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Not Found' }));
                    }
                } catch (error: any) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: error.message || 'Internal Server Error' }));
                }
            });

            this.server.listen(this.port, '0.0.0.0', () => {
                console.log(`HTTP Server started on http://0.0.0.0:${this.port}`);
                resolve();
            });

            this.server.on('error', (error: any) => {
                if (error.code === 'EADDRINUSE') {
                    console.error(`Port ${this.port} is already in use`);
                    reject(error);
                } else {
                    console.error('HTTP Server error:', error);
                    reject(error);
                }
            });
        });
    }

    private async handleTemplaterRequest(
        req: any,
        res: any,
        parsedUrl: any
    ) {
        try {
            // 解析查询参数
            const query = parsedUrl.query;
            const filename = query.filename as string | undefined;
            const paramsStr = query.params as string | undefined;
            const extract = query.extract !== 'false'; // 默认为 true
            const idxStr = query.idx as string | undefined;
            const target = query.target as string | undefined;

            // 解析额外参数（从 params 查询参数或 POST body）
            let extra: any = null;
            if (req.method === 'POST') {
                const body = await this.readBody(req);
                try {
                    extra = JSON.parse(body);
                } catch {
                    // 如果解析失败，尝试从查询参数获取
                    if (paramsStr) {
                        try {
                            extra = JSON.parse(decodeURIComponent(paramsStr));
                        } catch {
                            extra = paramsStr;
                        }
                    }
                }
            } else {
                // GET 请求
                if (paramsStr) {
                    try {
                        extra = JSON.parse(decodeURIComponent(paramsStr));
                    } catch {
                        extra = paramsStr;
                    }
                }
            }

            // 解析 idx 参数（索引数组）
            let idx: number[] | null = null;
            if (idxStr) {
                try {
                    idx = JSON.parse(idxStr);
                    if (!Array.isArray(idx)) {
                        idx = null;
                    }
                } catch {
                    // 如果不是 JSON，尝试作为逗号分隔的数字
                    const parts = idxStr.split(',').map(p => parseInt(p.trim())).filter(n => !isNaN(n));
                    if (parts.length > 0) {
                        idx = parts;
                    }
                }
            }

            // 调用 parse_templater
            const template = filename || '';
            const result = await this.templater.parse_templater(
                template,
                extract,
                extra,
                idx,
                target || ''
            );

            // 返回结果
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: true, result: result }, null, 2));
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                success: false, 
                error: error.message || 'Unknown error',
                stack: error.stack 
            }));
        }
    }

    private readBody(req: any): Promise<string> {
        return new Promise((resolve, reject) => {
            let body = '';
            req.on('data', (chunk:any) => {
                body += chunk.toString();
            });
            req.on('end', () => {
                resolve(body);
            });
            req.on('error', (error:any) => {
                reject(error);
            });
        });
    }

    stop(): Promise<void> {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    console.log('HTTP Server stopped');
                    this.server = null;
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    setPort(port: number) {
        this.port = port;
    }

    isRunning(): boolean {
        return this.server !== null;
    }
}

