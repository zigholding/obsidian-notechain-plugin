import { App } from 'obsidian';
import { Templater } from '../easyapi/templater';
import { readHttpBody } from './httpUtil';
import { ensureSelfSignedCert } from './httpsCert';
import { MCPHttpHandlers } from './mcpHttp';
import { OnlineHttpHandlers } from './onlineHttp';
import { OldBuddyStore } from './oldbuddy/oldbuddyStore';
import { OldBuddyHttpHandlers } from './oldbuddy/oldbuddyHttp';

let https = require('https');
let http = require('http');
let url = require('url');
let path = require('path');

export class HTTPServer {
    private templater: Templater;
    private server: any = null;
    /** 127.0.0.1 专用 HTTP，供 Obsidian WebViewer 加载（免自签证书） */
    private localServer: any = null;
    /** 合并并发 stop，且避免对同一 server 调用两次 close() */
    private stopPromise: Promise<void> | null = null;
    private port: number;
    private host: string;
    private tlsDir: string;
    private httpsEnabled = true;
    private httpEnabled = true;
    /** 本机 HTTP 实际监听端口（start 时确定，避免与 HTTPS 并行启动竞态） */
    private localHttpPort = 0;
    private sseConnections: Map<string, any> = new Map();
    private mcp: MCPHttpHandlers;
    private online: OnlineHttpHandlers;
    private oldbuddyStore: OldBuddyStore;
    private oldbuddy: OldBuddyHttpHandlers;

    constructor(
        app: App,
        templater: Templater,
        configDir: string,
        host: string = '0.0.0.0',
        port: number = 3000,
    ) {
        this.templater = templater;
        this.host = host;
        this.port = port;
        this.tlsDir = path.join(configDir, 'plugins', 'note-chain', 'tls');
        this.mcp = new MCPHttpHandlers(app, templater, this.sseConnections, () => this.port);
        this.online = new OnlineHttpHandlers(app);
        this.oldbuddyStore = new OldBuddyStore(templater, configDir);
        this.oldbuddy = new OldBuddyHttpHandlers(this.oldbuddyStore);
    }

    getBaseUrl(hostOverride?: string): string {
        const h = hostOverride || this.host;
        const displayHost = h === '0.0.0.0' ? '127.0.0.1' : h;
        return `https://${displayHost}:${this.port}`;
    }

    getObsidianBaseUrl(): string {
        return `http://127.0.0.1:${this.getLocalPort()}`;
    }

    getObsidianOldBuddyUrl(): string {
        return `${this.getObsidianBaseUrl()}/oldbuddy`;
    }

    getLocalPort(): number {
        if (this.localHttpPort > 0) return this.localHttpPort;
        return this.httpsEnabled ? this.port + 1 : this.port;
    }

    isHttpsRunning(): boolean {
        return this.server !== null;
    }

    isHttpRunning(): boolean {
        return this.localServer !== null;
    }

    getPort(): number {
        return this.port;
    }

    getTlsDir(): string {
        return this.tlsDir;
    }

    start(options?: { https?: boolean; http?: boolean }): Promise<void> {
        this.httpsEnabled = options?.https ?? true;
        this.httpEnabled = options?.http ?? true;
        if (!this.httpsEnabled && !this.httpEnabled) {
            return Promise.resolve();
        }
        return this.startInternal();
    }

    private createRequestHandler() {
        return async (req: any, res: any) => {
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
                } else if (await this.oldbuddy.handle(req, res, parsedUrl)) {
                    // oldbuddy routes handled
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
        };
    }

    private async startInternal(): Promise<void> {
        if (this.server || this.localServer) {
            return;
        }

        const handler = this.createRequestHandler();
        this.localHttpPort = this.httpEnabled ? (this.httpsEnabled ? this.port + 1 : this.port) : 0;

        try {
            if (this.httpsEnabled) {
                await this.startHttpsServer(handler);
            }
            if (this.httpEnabled) {
                await this.startLocalHttpServer(handler, this.localHttpPort);
            }
        } catch (e) {
            await this.stop();
            throw e;
        }
    }

    private startHttpsServer(handler: (req: any, res: any) => void): Promise<void> {
        return new Promise(async (resolve, reject) => {
            try {
                const { key, cert } = await ensureSelfSignedCert(this.tlsDir);
                this.server = https.createServer({ key, cert }, handler);
                this.server.keepAliveTimeout = 120000;
                this.server.headersTimeout = 120000;

                this.server.on('error', (error: any) => {
                    this.server = null;
                    if (error.code === 'EADDRINUSE') {
                        console.error(`Port ${this.port} is already in use`);
                        reject(error);
                    } else {
                        console.error('HTTPS Server error:', error);
                        reject(error);
                    }
                });

                this.server.on('upgrade', (req: any, socket: any, head: Buffer) => {
                    this.handleServerUpgrade(req, socket, head);
                });

                this.server.listen(this.port, this.host, () => resolve());
            } catch (e) {
                reject(e);
            }
        });
    }

    private handleServerUpgrade(req: any, socket: any, head: Buffer) {
        try {
            const parsed = url.parse(req.url || '', true);
            if (this.oldbuddy.isWebSocketPath(parsed.pathname)) {
                this.oldbuddy.handleUpgrade(req, socket, head);
                return;
            }
        } catch (e) {
            console.error('[oldbuddy] websocket upgrade failed:', e);
        }
        socket.destroy();
    }

    private startLocalHttpServer(handler: (req: any, res: any) => void, localPort: number): Promise<void> {
        if (this.localServer) return Promise.resolve();

        this.localServer = http.createServer(handler);
        this.localServer.keepAliveTimeout = 120000;
        this.localServer.headersTimeout = 120000;

        return new Promise((resolve, reject) => {
            this.localServer.on('error', (error: any) => {
                console.error(`[note-chain] local HTTP on 127.0.0.1:${localPort} failed:`, error?.message || error);
                this.localServer = null;
                reject(error);
            });

            this.localServer.on('upgrade', (req: any, socket: any, head: Buffer) => {
                this.handleServerUpgrade(req, socket, head);
            });

            this.localServer.listen(localPort, '127.0.0.1', () => {
                console.log(`[note-chain] Obsidian WebViewer: ${this.getObsidianOldBuddyUrl()}`);
                resolve();
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
        if (!this.server && !this.localServer) {
            return Promise.resolve();
        }

        const srv = this.server;
        const localSrv = this.localServer;

        this.stopPromise = new Promise((resolve) => {
            let pending = (srv ? 1 : 0) + (localSrv ? 1 : 0);
            const doneOne = () => {
                pending -= 1;
                if (pending <= 0) {
                    this.server = null;
                    this.localServer = null;
                    this.localHttpPort = 0;
                    this.stopPromise = null;
                    resolve();
                }
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
            this.oldbuddyStore.close();

            if (srv) {
                if (typeof srv.closeAllConnections === 'function') {
                    srv.closeAllConnections();
                }
                if (typeof srv.closeIdleConnections === 'function') {
                    srv.closeIdleConnections();
                }
                srv.close(() => doneOne());
            }

            if (localSrv) {
                if (typeof localSrv.closeAllConnections === 'function') {
                    localSrv.closeAllConnections();
                }
                if (typeof localSrv.closeIdleConnections === 'function') {
                    localSrv.closeIdleConnections();
                }
                localSrv.close(() => doneOne());
            }
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
        return this.server !== null || this.localServer !== null;
    }
}
