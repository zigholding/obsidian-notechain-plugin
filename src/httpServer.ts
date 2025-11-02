import { App } from 'obsidian';
import { Templater } from './easyapi/templater';

const http = require('http');
const url = require('url');

export class HTTPServer {
    private app: App;
    private templater: Templater;
    private server: any = null;
    private port: number;
    private sseConnections: Map<string, any> = new Map();

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

            if (this.server && this.server.listening) {
                this.server.close();
            }

            this.server = http.createServer(async (req:any, res:any) => {
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

                if (req.method === 'OPTIONS') {
                    res.writeHead(200);
                    res.end();
                    return;
                }

                try {
                    const parsedUrl = url.parse(req.url || '', true);
                    
                    console.log(`[${req.method}] ${parsedUrl.pathname}`);
                    
                    if (parsedUrl.pathname === '/templater' && (req.method === 'GET' || req.method === 'POST')) {
                        await this.handleTemplaterRequest(req, res, parsedUrl);
                    } else if (parsedUrl.pathname === '/mcp/list_tools' && (req.method === 'GET' || req.method === 'POST')) {
                        await this.handleMCPListTools(req, res);
                    } else if (parsedUrl.pathname === '/mcp/call_tool' && req.method === 'POST') {
                        await this.handleMCPCallTool(req, res);
                    } else if (parsedUrl.pathname === '/sse' && req.method === 'GET') {
                        await this.handleSSEConnection(req, res);
                    } else if (parsedUrl.pathname === '/messages' && req.method === 'POST') {
                        await this.handleMCPMessage(req, res);
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

            // 设置服务器的 keep-alive 超时
            this.server.keepAliveTimeout = 120000; // 120秒
            this.server.headersTimeout = 120000;   // 120秒

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

    private async handleTemplaterRequest(req: any, res: any, parsedUrl: any) {
        try {
            const query = parsedUrl.query;
            const filename = query.filename as string | undefined;
            const paramsStr = query.params as string | undefined;
            const extract = query.extract !== 'false';
            const idxStr = query.idx as string | undefined;
            const target = query.target as string | undefined;

            let extra: any = null;
            if (req.method === 'POST') {
                const body = await this.readBody(req);
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
                    const parts = idxStr.split(',').map(p => parseInt(p.trim())).filter(n => !isNaN(n));
                    if (parts.length > 0) {
                        idx = parts;
                    }
                }
            }

            const template = filename || '';
            const result = await this.templater.parse_templater(
                template,
                extract,
                extra,
                idx,
                target || ''
            );

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

    private async handleMCPListTools(req: any, res: any) {
        try {
            const listToolsFile = 'obsidian_mcp_list_tools.md';
            const result = await this.templater.parse_templater(
                listToolsFile,
                true,
                null,
                null,
                ''
            );

            let tools: any[] = [];
            
            if (result && result.length > 0) {
                const resultStr = result.join('\n').trim();
                try {
                    const parsed = JSON.parse(resultStr);
                    if (Array.isArray(parsed)) {
                        tools = parsed;
                    } else if (parsed && Array.isArray(parsed.tools)) {
                        tools = parsed.tools;
                    } else if (typeof parsed === 'object') {
                        tools = [parsed];
                    }
                } catch {
                    console.warn('list_tools script returned invalid JSON');
                }
            }

            const response = {
                tools: tools
            };

            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(response, null, 2));
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                error: 'Failed to list tools',
                message: error.message || 'Unknown error',
                stack: error.stack 
            }));
        }
    }

    private async handleMCPCallTool(req: any, res: any) {
        try {
            const body = await this.readBody(req);
            let requestData: any = {};
            
            try {
                requestData = JSON.parse(body);
            } catch {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON in request body' }));
                return;
            }

            const toolName = requestData.name;
            const toolArguments = requestData.arguments || {};

            if (!toolName) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Tool name is required' }));
                return;
            }

            let scriptFile = toolName;
            if (!scriptFile.endsWith('.md')) {
                scriptFile = scriptFile + '.md';
            }

            const result = await this.templater.parse_templater(
                scriptFile,
                true,
                toolArguments,
                null,
                ''
            );

            const content = result.map((item: any) => {
                if (typeof item === 'object' && item !== null) {
                    return item;
                }
                return {
                    type: 'text',
                    text: String(item || '')
                };
            });

            const response = {
                content: content
            };

            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(response, null, 2));
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                error: 'Failed to call tool',
                message: error.message || 'Unknown error',
                stack: error.stack 
            }));
        }
    }

    /**
     * 处理 SSE 连接
     * 🔥 关键修复：fastmcp Python 客户端需要在 SSE 连接建立后立即发送 endpoint 事件
     */
    private async handleSSEConnection(req: any, res: any) {
        console.log('\n=== SSE Connection ===');
        console.log('User-Agent:', req.headers['user-agent'] || 'unknown');
        
        // 1. 立即设置响应头
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'X-Accel-Buffering': 'no'
        });
        
        // 2. 🔥 关键：立即发送 endpoint 事件（fastmcp 客户端需要这个）
        // fastmcp 会解析这个事件来获取 /messages 端点的 URL
        const sessionId = Date.now().toString() + Math.random().toString(36).substring(7);
        const endpointUrl = `/messages?session_id=${sessionId}`;
        
        // 发送 endpoint 事件（这是 fastmcp 客户端期望的格式）
        res.write(`event: endpoint\n`);
        res.write(`data: ${endpointUrl}\n\n`);
        
        // 立即刷新
        if (typeof res.flush === 'function') {
            res.flush();
        }
        
        console.log('✓ SSE connected, endpoint sent:', endpointUrl);

        // 生成连接 ID
        const connectionId = sessionId;
        
        // 保存连接
        this.sseConnections.set(connectionId, {
            res: res,
            sessionId: sessionId,
            connectedAt: new Date()
        });
        
        console.log('✓ Connection ID:', connectionId);
        console.log('✓ Active connections:', this.sseConnections.size);

        // 清理函数
        const cleanup = () => {
            console.log('✗ SSE closed:', connectionId);
            this.sseConnections.delete(connectionId);
            clearInterval(heartbeatInterval);
        };

        // 监听连接事件
        req.on('close', cleanup);
        req.on('error', (error: any) => {
            console.error('✗ Request error:', error.message);
            cleanup();
        });
        res.on('error', (error: any) => {
            console.error('✗ Response error:', error.message);
            cleanup();
        });

        // 发送心跳 ping（SSE 注释格式）
        const heartbeatInterval = setInterval(() => {
            try {
                if (this.sseConnections.has(connectionId)) {
                    const now = new Date().toISOString();
                    res.write(`: ping - ${now}\n\n`);
                    if (typeof res.flush === 'function') {
                        res.flush();
                    }
                } else {
                    clearInterval(heartbeatInterval);
                }
            } catch (error) {
                clearInterval(heartbeatInterval);
                cleanup();
            }
        }, 30000); // 30秒心跳

        console.log('✓ SSE ready, waiting for messages at:', endpointUrl);
    }

    /**
     * 处理 MCP 消息
     * 通过 SSE 连接发送响应
     */
    private async handleMCPMessage(req: any, res: any) {
        console.log('\n=== MCP Message ===');
        
        try {
            // 从查询参数获取 session_id
            const parsedUrl = url.parse(req.url || '', true);
            const sessionId = parsedUrl.query.session_id as string;
            
            console.log('Session ID:', sessionId);

            const body = await this.readBody(req);
            let request: any = {};
            
            try {
                request = JSON.parse(body);
                console.log('→ Request:', JSON.stringify(request, null, 2));
            } catch (error: any) {
                console.error('✗ Parse error');
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    jsonrpc: '2.0',
                    id: null,
                    error: { code: -32700, message: 'Parse error' }
                }));
                return;
            }

            if (!request.jsonrpc || request.jsonrpc !== '2.0') {
                console.warn('✗ Invalid JSON-RPC');
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    jsonrpc: '2.0',
                    id: request.id || null,
                    error: { code: -32600, message: 'Invalid Request' }
                }));
                return;
            }

            const method = request.method;
            const params = request.params || {};
            const id = request.id;
            
            console.log(`→ Method: ${method}, ID: ${id}`);

            // 构建响应
            let response: any = {
                jsonrpc: '2.0',
                id: id
            };

            // 处理不同的方法
            if (method === 'initialize') {
                response.result = {
                    protocolVersion: params.protocolVersion || '2024-11-05',
                    capabilities: {
                        tools: {
                            listChanged: false
                        }
                    },
                    serverInfo: {
                        name: 'NoteChain MCP Server',
                        version: '1.0.0'
                    }
                };
                
            } else if (method === 'tools/list') {
                try {
                    const result = await this.templater.parse_templater(
                        'obsidian_mcp_list_tools.md',
                        true,
                        null,
                        null,
                        ''
                    );

                    let tools: any[] = [];
                    if (result && result.length > 0) {
                        const resultStr = result.join('\n').trim();
                        try {
                            const parsed = JSON.parse(resultStr);
                            if (Array.isArray(parsed)) {
                                tools = parsed;
                            } else if (parsed && Array.isArray(parsed.tools)) {
                                tools = parsed.tools;
                            }
                        } catch {
                            console.warn('✗ Invalid JSON from list_tools');
                        }
                    }

                    response.result = { tools: tools };
                    console.log(`✓ Found ${tools.length} tools`);
                    
                } catch (error: any) {
                    console.error('✗ Error listing tools:', error);
                    response.error = {
                        code: -32603,
                        message: 'Internal error',
                        data: error.message
                    };
                }
                
            } else if (method === 'tools/call') {
                const toolName = params.name;
                const toolArguments = params.arguments || {};

                if (!toolName) {
                    response.error = {
                        code: -32602,
                        message: 'Invalid params: tool name is required'
                    };
                } else {
                    try {
                        let scriptFile = toolName;
                        if (!scriptFile.endsWith('.md')) {
                            scriptFile = scriptFile + '.md';
                        }

                        const result = await this.templater.parse_templater(
                            scriptFile,
                            true,
                            toolArguments,
                            null,
                            ''
                        );

                        const content = result.map((item: any) => {
                            if (typeof item === 'object' && item !== null) {
                                return item;
                            }
                            return {
                                type: 'text',
                                text: String(item || '')
                            };
                        });

                        response.result = { content: content };
                        console.log('✓ Tool executed');
                        
                    } catch (error: any) {
                        console.error('✗ Error calling tool:', error);
                        response.error = {
                            code: -32603,
                            message: 'Internal error',
                            data: error.message
                        };
                    }
                }
            } else if (method === 'notifications/initialized') {
                // 客户端发送的初始化确认通知，不需要响应
                console.log('✓ Received initialized notification from client');
                // 对于通知（没有 id 的消息），不发送响应
                res.writeHead(202, { 
                    'Content-Type': 'application/json; charset=utf-8',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify({ accepted: true, message: 'Notification received' }));
                return;
            } else {
                console.warn('✗ Unknown method:', method);
                response.error = {
                    code: -32601,
                    message: `Method not found: ${method}`
                };
            }

            // 🔥 通过 SSE 发送响应
            let sentViaSSE = false;
            
            // 如果有 session_id，查找对应的 SSE 连接
            if (sessionId && this.sseConnections.has(sessionId)) {
                const conn = this.sseConnections.get(sessionId);
                const sseRes = conn.res;
                
                try {
                    // 发送响应
                    const jsonData = JSON.stringify(response);
                    sseRes.write(`data: ${jsonData}\n\n`);
                    if (typeof sseRes.flush === 'function') {
                        sseRes.flush();
                    }
                    sentViaSSE = true;
                    console.log('✓ Response sent via SSE');
                    
                    // 如果是 initialize，发送 initialized 通知
                    if (method === 'initialize') {
                        const notification = {
                            jsonrpc: '2.0',
                            method: 'notifications/initialized',
                            params: {}
                        };
                        const notificationData = JSON.stringify(notification);
                        sseRes.write(`data: ${notificationData}\n\n`);
                        if (typeof sseRes.flush === 'function') {
                            sseRes.flush();
                        }
                        console.log('✓ Sent notifications/initialized');
                    }
                } catch (error) {
                    console.error('✗ Failed to send via SSE:', error);
                    this.sseConnections.delete(sessionId);
                }
            } else {
                // 如果没有 session_id，尝试发送到任意活跃连接
                for (const [connId, conn] of this.sseConnections.entries()) {
                    try {
                        const sseRes = conn.res;
                        const jsonData = JSON.stringify(response);
                        sseRes.write(`data: ${jsonData}\n\n`);
                        if (typeof sseRes.flush === 'function') {
                            sseRes.flush();
                        }
                        sentViaSSE = true;
                        console.log('✓ Response sent via SSE (fallback):', connId);
                        
                        if (method === 'initialize') {
                            const notification = {
                                jsonrpc: '2.0',
                                method: 'notifications/initialized',
                                params: {}
                            };
                            const notificationData = JSON.stringify(notification);
                            sseRes.write(`data: ${notificationData}\n\n`);
                            if (typeof sseRes.flush === 'function') {
                                sseRes.flush();
                            }
                            console.log('✓ Sent notifications/initialized');
                        }
                        
                        break;
                    } catch (error) {
                        console.error('✗ Failed to send via SSE:', error);
                        this.sseConnections.delete(connId);
                    }
                }
            }
            
            // HTTP 响应
            if (!sentViaSSE) {
                console.warn('⚠ No SSE connection, sending via HTTP');
                res.writeHead(200, { 
                    'Content-Type': 'application/json; charset=utf-8',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify(response, null, 2));
            } else {
                // 返回 202 Accepted
                res.writeHead(202, { 
                    'Content-Type': 'application/json; charset=utf-8',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify({ 
                    accepted: true, 
                    message: 'Response sent via SSE'
                }));
            }
            
        } catch (error: any) {
            console.error('✗ Error:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                jsonrpc: '2.0',
                id: null,
                error: {
                    code: -32603,
                    message: 'Internal error',
                    data: error.message
                }
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
                // 关闭所有 SSE 连接
                for (const [connId, conn] of this.sseConnections.entries()) {
                    try {
                        conn.res.end();
                    } catch (e) {
                        // 忽略错误
                    }
                }
                this.sseConnections.clear();
                
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