import { App } from 'obsidian';
import { Templater } from '../easyapi/templater';
import { readHttpBody } from './httpUtil';
import { MCPHttpHandlers } from './mcpHttp';
import { OnlineHttpHandlers } from './onlineHttp';

let http = require('http');
let url = require('url');

export class HTTPServer {
    private templater: Templater;
    private server: any = null;
    /** 合并并发 stop，且避免对同一 server 调用两次 close() */
    private stopPromise: Promise<void> | null = null;
    private port: number;
    private host: string;
    private sseConnections: Map<string, any> = new Map();
    private mcp: MCPHttpHandlers;
    private online: OnlineHttpHandlers;

    constructor(app: App, templater: Templater, host: string = '0.0.0.0', port: number = 3000) {
        this.templater = templater;
        this.host = host;
        this.port = port;
        this.mcp = new MCPHttpHandlers(app, templater, this.sseConnections, () => this.port);
        this.online = new OnlineHttpHandlers(app);
    }

    start(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.server) {
                resolve();
                return;
            }

            if (this.server && this.server.listening) {
                this.server.close();
            }

            this.server = http.createServer(async (req: any, res: any) => {
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

                if (req.method === 'OPTIONS') {
                    res.writeHead(200);
                    res.end();
                    return;
                }

                try {
                    let parsedUrl = url.parse(req.url || '', true);

                    if (parsedUrl.pathname === '/templater' && (req.method === 'GET' || req.method === 'POST')) {
                        await this.handleTemplaterRequest(req, res, parsedUrl);
                    } else if (parsedUrl.pathname === '/mcp/list_tools' && (req.method === 'GET' || req.method === 'POST')) {
                        await this.mcp.handleMCPListTools(req, res);
                    } else if (parsedUrl.pathname === '/mcp/call_tool' && req.method === 'POST') {
                        await this.mcp.handleMCPCallTool(req, res);
                    } else if (parsedUrl.pathname === '/sse' && req.method === 'GET') {
                        await this.mcp.handleSSEConnection(req, res);
                    } else if (parsedUrl.pathname === '/messages' && req.method === 'POST') {
                        await this.mcp.handleMCPMessage(req, res);
                    } else if (parsedUrl.pathname === '/mcp/test' && req.method === 'GET') {
                        await this.mcp.handleMCPTestPage(req, res);
                    } else if (parsedUrl.pathname === '/mcp/skill' && req.method === 'GET') {
                        await this.mcp.handleMCPSkill(req, res);
                    } else if (
                        (parsedUrl.pathname === '/online' || parsedUrl.pathname === '/online/') &&
                        req.method === 'GET'
                    ) {
                        await this.online.handleOnlinePage(req, res);
                    } else if (parsedUrl.pathname === '/online/api/resolve-note' && req.method === 'GET') {
                        await this.online.handleOnlineResolveNote(req, res, parsedUrl);
                    } else if (parsedUrl.pathname === '/online/api/search' && req.method === 'GET') {
                        await this.online.handleOnlineSearch(req, res, parsedUrl);
                    } else if (parsedUrl.pathname === '/online/api/note' && req.method === 'GET') {
                        await this.online.handleOnlineNoteGet(req, res, parsedUrl);
                    } else if (parsedUrl.pathname === '/online/api/note' && req.method === 'POST') {
                        await this.online.handleOnlineNoteSave(req, res);
                    } else if (parsedUrl.pathname === '/online/api/render' && req.method === 'POST') {
                        await this.online.handleOnlineRender(req, res);
                    } else if (parsedUrl.pathname === '/online/api/resolve-link' && req.method === 'GET') {
                        await this.online.handleOnlineResolveLink(req, res, parsedUrl);
                    } else if (parsedUrl.pathname === '/online/api/media' && req.method === 'GET') {
                        await this.online.handleOnlineMedia(req, res, parsedUrl);
                    } else if (parsedUrl.pathname === '/online/api/textarea-exec' && req.method === 'POST') {
                        await this.online.handleOnlineTextareaExec(req, res);
                    } else {
                        console.warn(`Unknown route: ${req.method} ${parsedUrl.pathname}`);
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Not Found', path: parsedUrl.pathname }));
                    }
                } catch (error: any) {
                    console.error('Server error:', error);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: error.message || 'Internal Server Error' }));
                }
            });

            this.server.keepAliveTimeout = 120000;
            this.server.headersTimeout = 120000;

            this.server.listen(this.port, this.host, () => {
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

    private async handleTemplaterRequest(req: any, res: any, parsedUrl: any) {
        try {
            let query = parsedUrl.query;
            let filename = query.filename as string | undefined;
            let paramsStr = query.params as string | undefined;
            let extract = query.extract !== 'false';
            let idxStr = query.idx as string | undefined;
            let target = query.target as string | undefined;

            let extra: any = null;
            if (req.method === 'POST') {
                let body = await readHttpBody(req);
                try {
                    extra = JSON.parse(body);
                } catch {
                    if (paramsStr) {
                        try {
                            extra = JSON.parse(decodeURIComponent(paramsStr));
                        } catch {
                            extra = paramsStr;
                        }
                    }
                }
            } else {
                if (paramsStr) {
                    try {
                        extra = JSON.parse(decodeURIComponent(paramsStr));
                    } catch {
                        extra = paramsStr;
                    }
                }
            }

            let idx: number[] | null = null;
            if (idxStr) {
                try {
                    idx = JSON.parse(idxStr);
                    if (!Array.isArray(idx)) {
                        idx = null;
                    }
                } catch {
                    let parts = idxStr.split(',').map((p) => parseInt(p.trim())).filter((n) => !isNaN(n));
                    if (parts.length > 0) {
                        idx = parts;
                    }
                }
            }

            let template = filename || '';
            let result = await this.templater.parse_templater(template, extract, extra, idx, target || '');

            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: true, result: result }, null, 2));
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(
                JSON.stringify({
                    success: false,
                    error: error.message || 'Unknown error',
                    stack: error.stack,
                }),
            );
        }
    }

    getMCPSkillMarkdown(baseUrl: string, tools?: any[]): string {
        return this.mcp.getMCPSkillMarkdown(baseUrl, tools);
    }

    async getMCPSkillMarkdownAsync(baseUrl: string): Promise<string> {
        return this.mcp.getMCPSkillMarkdownAsync(baseUrl);
    }

    stop(): Promise<void> {
        if (this.stopPromise) {
            return this.stopPromise;
        }
        if (!this.server) {
            return Promise.resolve();
        }

        const srv = this.server;

        this.stopPromise = new Promise((resolve) => {
            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                if (this.server === srv) {
                    this.server = null;
                }
                this.stopPromise = null;
                resolve();
            };

            for (let [, conn] of this.sseConnections.entries()) {
                try {
                    if (conn.heartbeatInterval) {
                        clearInterval(conn.heartbeatInterval);
                        conn.heartbeatInterval = null;
                    }
                    conn.res.end();
                    conn.res.socket?.destroy();
                } catch (e) {
                    // ignore
                }
            }
            this.sseConnections.clear();

            if (typeof srv.closeAllConnections === 'function') {
                srv.closeAllConnections();
            }
            if (typeof srv.closeIdleConnections === 'function') {
                srv.closeIdleConnections();
            }

            srv.close(() => finish());
        });

        return this.stopPromise;
    }

    setHost(host: string) {
        this.host = host;
    }

    setPort(port: number) {
        this.port = port;
    }

    isRunning(): boolean {
        return this.server !== null;
    }
}
