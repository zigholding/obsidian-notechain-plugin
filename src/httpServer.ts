import { App } from 'obsidian';
import { Templater } from './easyapi/templater';

const http = require('http');
const url = require('url');

export class HTTPServer {
    private app: App;
    private templater: Templater;
    private server: any = null;
    private port: number;
    private sseConnections: Map<string, any> = new Map(); // 存储 SSE 连接（key: connectionId, value: res）
    private sseConnectionId: string | null = null; // 当前活跃的 SSE 连接 ID（fastmcp 通常只有一个连接）

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
                    
                    // 记录所有请求（用于调试）
                    console.log(`[${req.method}] ${parsedUrl.pathname}`, parsedUrl.query ? `query: ${JSON.stringify(parsedUrl.query)}` : '');
                    
                    if (parsedUrl.pathname === '/templater' && (req.method === 'GET' || req.method === 'POST')) {
                        await this.handleTemplaterRequest(req, res, parsedUrl);
                    } else if (parsedUrl.pathname === '/mcp/list_tools' && (req.method === 'GET' || req.method === 'POST')) {
                        await this.handleMCPListTools(req, res);
                    } else if (parsedUrl.pathname === '/mcp/call_tool' && req.method === 'POST') {
                        await this.handleMCPCallTool(req, res);
                    } else if (parsedUrl.pathname === '/sse' && req.method === 'GET') {
                        await this.handleSSEConnection(req, res);
                    } else if ((parsedUrl.pathname === '/messages' || parsedUrl.pathname.startsWith('/messages')) && req.method === 'POST') {
                        // MCP 消息端点（用于接收客户端 JSON-RPC 请求）
                        console.log('POST request to:', parsedUrl.pathname);
                        await this.handleMCPMessage(req, res);
                    } else {
                        console.warn(`Unknown route: ${req.method} ${parsedUrl.pathname}`);
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Not Found', path: parsedUrl.pathname }));
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

    /**
     * 处理 MCP list_tools 请求
     * 执行 obsidian_mcp_list_tools.md 脚本笔记，返回所有工具列表
     */
    private async handleMCPListTools(req: any, res: any) {
        try {
            // 执行 obsidian_mcp_list_tools.md 脚本笔记
            const listToolsFile = 'obsidian_mcp_list_tools.md';
            const result = await this.templater.parse_templater(
                listToolsFile,
                true,  // extract
                null,  // extra
                null,  // idx
                ''     // target
            );

            // 解析脚本返回的结果（应该是 JSON 字符串或对象）
            let tools: any[] = [];
            
            if (result && result.length > 0) {
                const resultStr = result.join('\n').trim();
                try {
                    // 尝试解析为 JSON
                    const parsed = JSON.parse(resultStr);
                    if (Array.isArray(parsed)) {
                        tools = parsed;
                    } else if (parsed && Array.isArray(parsed.tools)) {
                        tools = parsed.tools;
                    } else if (typeof parsed === 'object') {
                        // 如果是单个对象，包装成数组
                        tools = [parsed];
                    }
                } catch {
                    // 如果不是 JSON，尝试从文本中提取工具信息
                    // 假设脚本返回的是工具列表的描述
                    console.warn('list_tools 脚本返回的不是有效的 JSON，尝试解析文本');
                }
            }

            // 返回 MCP 标准格式
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

    /**
     * 处理 MCP call_tool 请求
     * 执行对应的脚本笔记作为工具函数
     */
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

            // 工具名称对应脚本笔记文件名（通常是 toolName.md）
            // 也可以支持其他命名规则
            let scriptFile = toolName;
            if (!scriptFile.endsWith('.md')) {
                scriptFile = scriptFile + '.md';
            }

            // 执行对应的脚本笔记
            const result = await this.templater.parse_templater(
                scriptFile,
                true,  // extract
                toolArguments,  // extra - 将 arguments 作为 extra 参数传递
                null,  // idx
                ''     // target
            );

            // MCP 标准响应格式
            const content = result.map((item: any) => {
                // 如果结果已经是对象，直接使用；否则包装成文本内容
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
     * 处理 SSE (Server-Sent Events) 连接
     * 用于支持 MCP 协议的 SSE 通信
     * 
     * MCP over SSE 协议流程：
     * 1. 客户端连接到 SSE 端点
     * 2. 服务器立即通过 SSE 流发送消息端点 URL（格式：{ "messages": "http://..." }）
     * 3. 客户端使用该端点发送 JSON-RPC 请求
     * 4. 服务器通过 SSE 流返回响应
     */
    private async handleSSEConnection(req: any, res: any) {
        console.log('SSE connection established from:', req.headers['user-agent'] || 'unknown');
        
        // 设置 SSE 响应头
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Cache-Control',
            'X-Accel-Buffering': 'no' // 禁用 nginx 缓冲
        });

        // 生成连接 ID
        const connectionId = Date.now().toString() + Math.random().toString(36);
        this.sseConnections.set(connectionId, res);
        this.sseConnectionId = connectionId; // 保存当前连接 ID
        
        console.log('SSE Connection established:');
        console.log('  Connection ID:', connectionId);
        console.log('  Total connections:', this.sseConnections.size);
        console.log('  User-Agent:', req.headers['user-agent'] || 'unknown');
        console.log('  Remote IP:', req.socket.remoteAddress);

        // 发送符合 JSON-RPC 2.0 格式的消息
        const sendJSONRPC = (message: any) => {
            try {
                const jsonData = JSON.stringify(message);
                const sseMessage = `data: ${jsonData}\n\n`;
                res.write(sseMessage);
                console.log('SSE sent:', JSON.stringify(message, null, 2));
                // 立即刷新，确保数据发送
                if (typeof res.flush === 'function') {
                    res.flush();
                }
            } catch (error) {
                console.error('Failed to send SSE message:', error);
                throw error;
            }
        };
        
        // 保存 sendJSONRPC 函数到 res，供 handleMCPMessage 使用
        (res as any).sendJSONRPC = sendJSONRPC;

        // 创建处理请求的函数（可以从 POST /messages 接收）
        const handleRequest = async (request: any) => {
            const method = request.method;
            const params = request.params || {};
            const id = request.id;
            
            console.log(`Processing MCP method: ${method}, id: ${id}`);

            let response: any = {
                jsonrpc: '2.0',
                id: id
            };

            if (method === 'initialize') {
                console.log('Received initialize request');
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
                // 通过 SSE 发送响应
                sendJSONRPC(response);
                
                // 发送初始化完成通知
                sendJSONRPC({
                    jsonrpc: '2.0',
                    method: 'notifications/initialized',
                    params: {}
                });
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
                            console.warn('list_tools 脚本返回的不是有效的 JSON');
                        }
                    }

                    response.result = { tools: tools };
                    sendJSONRPC(response);
                } catch (error: any) {
                    response.error = {
                        code: -32603,
                        message: 'Internal error',
                        data: error.message
                    };
                    sendJSONRPC(response);
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
                        sendJSONRPC(response);
                    } catch (error: any) {
                        response.error = {
                            code: -32603,
                            message: 'Internal error',
                            data: error.message
                        };
                        sendJSONRPC(response);
                    }
                }
            } else {
                response.error = {
                    code: -32601,
                    message: `Method not found: ${method}`
                };
                sendJSONRPC(response);
            }
        };

        // 将 handleRequest 函数保存到连接对象，供 handleMCPMessage 使用
        (res as any).handleRequest = handleRequest;
        (res as any).connectionId = connectionId;

        // 🔥 关键修复：立即发送消息端点 URL
        // MCP over SSE 协议要求服务器在连接建立后立即发送消息端点
        const messagesUrl = `http://127.0.0.1:${this.port}/messages`;
        const endpointMessage = {
            messages: messagesUrl
        };
        sendJSONRPC(endpointMessage);
        console.log('Sent messages endpoint URL:', messagesUrl);

        // 监听连接关闭
        req.on('close', () => {
            console.log('SSE connection closed:', connectionId);
            this.sseConnections.delete(connectionId);
            if (this.sseConnectionId === connectionId) {
                this.sseConnectionId = null;
            }
            try {
                res.end();
            } catch (e) {
                // 忽略已经关闭的连接
            }
        });
        
        // 监听连接错误
        req.on('error', (error: any) => {
            console.error('SSE connection error:', error);
            this.sseConnections.delete(connectionId);
            if (this.sseConnectionId === connectionId) {
                this.sseConnectionId = null;
            }
        });
        
        // 监听响应错误
        res.on('error', (error: any) => {
            console.error('SSE response error:', error);
            this.sseConnections.delete(connectionId);
            if (this.sseConnectionId === connectionId) {
                this.sseConnectionId = null;
            }
        });

        // 定期发送心跳保持连接
        const heartbeat = setInterval(() => {
            try {
                res.write(': heartbeat\n\n');
            } catch (error) {
                clearInterval(heartbeat);
                this.sseConnections.delete(connectionId);
            }
        }, 30000); // 30秒心跳

        // 清理定时器
        req.on('close', () => {
            clearInterval(heartbeat);
        });
    }

    /**
     * 处理 MCP 消息（JSON-RPC 请求）
     * fastmcp 客户端通过 POST /messages 发送请求
     * 响应通过 SSE 流返回
     */
    private async handleMCPMessage(req: any, res: any) {
        try {
            const body = await this.readBody(req);
            let request: any = {};
            
            try {
                request = JSON.parse(body);
                console.log('MCP request received:', JSON.stringify(request, null, 2));
            } catch (error: any) {
                console.error('Failed to parse request body:', error);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    jsonrpc: '2.0',
                    id: null,
                    error: { code: -32700, message: 'Parse error' }
                }));
                return;
            }

            // 验证 JSON-RPC 格式
            if (!request.jsonrpc || request.jsonrpc !== '2.0') {
                console.warn('Invalid JSON-RPC version:', request.jsonrpc);
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
            
            console.log(`Processing MCP method: ${method}, id: ${id}`);

            let response: any = {
                jsonrpc: '2.0',
                id: id
            };

            // 处理不同的 MCP 方法
            if (method === 'initialize') {
                console.log('Received initialize request with params:', JSON.stringify(params, null, 2));
                
                // MCP 标准初始化响应
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
                
                console.log('Sending initialize response:', JSON.stringify(response, null, 2));
                
                // 发送初始化完成通知（通过 SSE，如果有连接）
                if (this.sseConnectionId && this.sseConnections.has(this.sseConnectionId)) {
                    const initNotification = {
                        jsonrpc: '2.0',
                        method: 'notifications/initialized',
                        params: {}
                    };
                    const sseRes = this.sseConnections.get(this.sseConnectionId);
                    try {
                        const jsonData = JSON.stringify(initNotification);
                        sseRes.write(`data: ${jsonData}\n\n`);
                        if (typeof sseRes.flush === 'function') {
                            sseRes.flush();
                        }
                        console.log('Sent notifications/initialized via SSE');
                    } catch (error) {
                        console.error('Failed to send initialized notification:', error);
                    }
                }
            } else if (method === 'tools/list') {
                console.log('Executing obsidian_mcp_list_tools.md');
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
                        } catch (parseError) {
                            console.warn('list_tools 脚本返回的不是有效的 JSON:', parseError);
                        }
                    }

                    response.result = {
                        tools: tools
                    };
                } catch (error: any) {
                    console.error('Error listing tools:', error);
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

                        response.result = {
                            content: content
                        };
                    } catch (error: any) {
                        console.error('Error calling tool:', error);
                        response.error = {
                            code: -32603,
                            message: 'Internal error',
                            data: error.message
                        };
                    }
                }
            } else {
                response.error = {
                    code: -32601,
                    message: `Method not found: ${method}`
                };
            }

            // 🔥 关键：通过 SSE 连接发送响应
            let sentViaSSE = false;
            if (this.sseConnectionId && this.sseConnections.has(this.sseConnectionId)) {
                const sseRes = this.sseConnections.get(this.sseConnectionId);
                try {
                    const jsonData = JSON.stringify(response);
                    const sseMessage = `data: ${jsonData}\n\n`;
                    sseRes.write(sseMessage);
                    if (typeof sseRes.flush === 'function') {
                        sseRes.flush();
                    }
                    sentViaSSE = true;
                    console.log('✓ Response sent via SSE');
                } catch (error) {
                    console.error('✗ Failed to send via SSE:', error);
                    this.sseConnections.delete(this.sseConnectionId);
                    this.sseConnectionId = null;
                }
            }
            
            // 如果没有 SSE 连接，通过 HTTP POST 响应返回（作为备选）
            if (!sentViaSSE) {
                console.log('⚠ Sending response via HTTP POST (no SSE connection)');
                res.writeHead(200, { 
                    'Content-Type': 'application/json; charset=utf-8',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify(response, null, 2));
            } else {
                // 已通过 SSE 发送，返回 202 Accepted
                res.writeHead(202, { 
                    'Content-Type': 'application/json; charset=utf-8',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify({ accepted: true, message: 'Response sent via SSE' }));
            }
        } catch (error: any) {
            console.error('Error handling MCP message:', error);
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
