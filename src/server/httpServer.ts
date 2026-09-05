import { App } from 'obsidian';
import { Templater } from '../easyapi/templater';
import { readHttpBody } from './httpUtil';
import { ensureSelfSignedCert } from './httpsCert';
import { ensureWindowsFirewallPorts } from './firewallWindows';
import { MCPHttpHandlers } from './mcpHttp';
import { OnlineHttpHandlers } from './onlineHttp';
import { OldBuddyStore } from './oldbuddy/oldbuddyStore';
import { OldBuddyHttpHandlers } from './oldbuddy/oldbuddyHttp';
import type { HttpReq, HttpRes, ParsedReqUrl, SseConnection } from '../http-types';
import { parseRequestUrl } from '../http-types';
import { errorMessage } from '../ts-helpers';
import { desktopNodeOrThrow, type NodeNetSocket, type NodePathModule } from '../obsidian-app';

type Socket = NodeNetSocket;

interface NodeHttpServer {
    keepAliveTimeout: number;
    headersTimeout: number;
    on(event: 'error', listener: (error: NodeJS.ErrnoException) => void): this;
    on(event: 'upgrade', listener: (req: HttpReq, socket: Socket, head: Buffer) => void): this;
    listen(port: number, host: string, cb: () => void): this;
    close(cb?: (err?: Error) => void): this;
    closeAllConnections?: () => void;
    closeIdleConnections?: () => void;
}

interface NodeHttpModule {
    createServer(listener: (req: HttpReq, res: HttpRes) => void): NodeHttpServer;
}

interface NodeHttpsModule {
    createServer(
        options: { key: string | Buffer; cert: string | Buffer },
        listener: (req: HttpReq, res: HttpRes) => void,
    ): NodeHttpServer;
}

type RequestHandler = (req: HttpReq, res: HttpRes) => void | Promise<void>;

const https = desktopNodeOrThrow<NodeHttpsModule>('https');
const http = desktopNodeOrThrow<NodeHttpModule>('http');
const path = desktopNodeOrThrow<NodePathModule>('path');

export class HTTPServer {
    private templater: Templater;
    private server: NodeHttpServer | null = null;
    /** 本机 HTTP（与 HTTPS 共用 setting 的 host） */
    private localServer: NodeHttpServer | null = null;
    /** 合并并发 stop，且避免对同一 server 调用两次 close() */
    private stopPromise: Promise<void> | null = null;
    private port: number;
    private host: string;
    private tlsDir: string;
    private httpsEnabled = true;
    private httpEnabled = true;
    /** 本机 HTTP 实际监听端口（start 时确定，避免与 HTTPS 并行启动竞态） */
    private localHttpPort = 0;
    private sseConnections: Map<string, SseConnection> = new Map();
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

    private resolveDisplayHost(host?: string): string {
        const h = host ?? this.host;
        return h === '0.0.0.0' ? '127.0.0.1' : h;
    }

    getBaseUrl(hostOverride?: string): string {
        const h = hostOverride || this.host;
        return `https://${this.resolveDisplayHost(h)}:${this.port}`;
    }

    getHttpBaseUrl(hostOverride?: string): string {
        const h = hostOverride || this.host;
        return `http://${this.resolveDisplayHost(h)}:${this.getLocalPort()}`;
    }

    getObsidianOldBuddyUrl(): string {
        return `${this.getHttpBaseUrl()}/oldbuddy`;
    }

    getHost(): string {
        return this.host;
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
        return async (req: HttpReq, res: HttpRes) => {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Api-Key, X-Sender-Id');

            if (req.method === 'OPTIONS') {
                res.writeHead(200);
                res.end();
                return;
            }

            try {
                let parsedUrl = parseRequestUrl(req.url || '');

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
            } catch (error: unknown) {
                console.error('Server error:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: errorMessage(error) || 'Internal Server Error' }));
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
            const fwPorts: number[] = [];
            if (this.httpsEnabled) fwPorts.push(this.port);
            if (this.httpEnabled && this.localHttpPort > 0) fwPorts.push(this.localHttpPort);
            ensureWindowsFirewallPorts(fwPorts);
        } catch (e) {
            await this.stop();
            throw e;
        }
    }

    private async startHttpsServer(handler: RequestHandler): Promise<void> {
        const { key, cert } = await ensureSelfSignedCert(this.tlsDir);
        return new Promise((resolve, reject) => {
            const httpsSrv = https.createServer({ key, cert }, (req, res) => {
                void handler(req, res);
            });
            this.server = httpsSrv;
            httpsSrv.keepAliveTimeout = 120000;
            httpsSrv.headersTimeout = 120000;

            httpsSrv.on('error', (error: NodeJS.ErrnoException) => {
                this.server = null;
                if (error.code === 'EADDRINUSE') {
                    console.error(`Port ${this.port} is already in use`);
                    reject(error);
                } else {
                    console.error('HTTPS Server error:', error);
                    reject(error);
                }
            });

            httpsSrv.on('upgrade', (req: HttpReq, socket: Socket, head: Buffer) => {
                this.handleServerUpgrade(req, socket, head);
            });

            httpsSrv.listen(this.port, this.host, () => resolve());
        });
    }

    private handleServerUpgrade(req: HttpReq, socket: Socket, head: Buffer) {
        try {
            const parsed = parseRequestUrl(req.url || '');
            if (this.oldbuddy.isWebSocketPath(parsed.pathname)) {
                this.oldbuddy.handleUpgrade(req, socket, head);
                return;
            }
        } catch (e) {
            console.error('[oldbuddy] websocket upgrade failed:', e);
        }
        socket.destroy();
    }

    private startLocalHttpServer(handler: RequestHandler, localPort: number): Promise<void> {
        if (this.localServer) return Promise.resolve();

        const httpSrv = http.createServer((req, res) => {
            void handler(req, res);
        });
        this.localServer = httpSrv;
        httpSrv.keepAliveTimeout = 120000;
        httpSrv.headersTimeout = 120000;

        return new Promise((resolve, reject) => {
            httpSrv.on('error', (error: NodeJS.ErrnoException) => {
                console.error(`[note-chain] HTTP on ${this.host}:${localPort} failed:`, error?.message || error);
                this.localServer = null;
                reject(error);
            });

            httpSrv.on('upgrade', (req: HttpReq, socket: Socket, head: Buffer) => {
                this.handleServerUpgrade(req, socket, head);
            });

            httpSrv.listen(localPort, this.host, () => {
                resolve();
            });
        });
    }

    private async handleTemplaterRequest(req: HttpReq, res: HttpRes, parsedUrl: ParsedReqUrl) {
        try {
            let query = parsedUrl.query;
            let filename = query.filename as string | undefined;
            let paramsStr = query.params as string | undefined;
            let extract = query.extract !== 'false';
            let idxStr = query.idx as string | undefined;
            let target = query.target as string | undefined;

            let extra: unknown = null;
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
        } catch (error: unknown) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(
                JSON.stringify({
                    success: false,
                    error: errorMessage(error) || 'Unknown error',
                    stack: error instanceof Error ? error.stack : undefined,
                }),
            );
        }
    }

    getMCPSkillMarkdown(baseUrl: string, tools?: unknown[]): string {
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
                        window.clearInterval(conn.heartbeatInterval);
                        conn.heartbeatInterval = null;
                    }
                    conn.res.end();
                    conn.res.socket?.destroy?.();
                } catch {
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
