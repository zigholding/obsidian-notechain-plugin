import { App } from 'obsidian';
import * as url from 'url';
import { Templater } from '../easyapi/templater';
import { readHttpBody } from './httpUtil';
import type { MCPToolsListService } from './mcpToolsList';

export class MCPSseAndJsonRpc {
    constructor(
        private app: App,
        private templater: Templater,
        private sseConnections: Map<string, any>,
        private tools: MCPToolsListService,
    ) {}

    async handleMCPCallTool(req: any, res: any) {
        try {
            let body = await readHttpBody(req);
            let requestData: any = {};
            
            try {
                requestData = JSON.parse(body);
            } catch {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON in request body' }));
                return;
            }

            let toolName = requestData.name;
            let toolArguments = requestData.arguments || {};

            if (!toolName) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Tool name is required' }));
                return;
            }

            let scriptFile = toolName;
            if (!scriptFile.endsWith('.md')) {
                scriptFile = scriptFile + '.md';
            }

            let result = await this.templater.parse_templater(
                scriptFile,
                true,
                toolArguments,
                null,
                ''
            );

            let content = result.map((item: any) => {
                if (typeof item === 'object' && item !== null) {
                    return item;
                }
                return {
                    type: 'text',
                    text: String(item || '')
                };
            });

            let response = {
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
    async handleSSEConnection(req: any, res: any) {
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
        let sessionId = Date.now().toString() + Math.random().toString(36).substring(7);
        let endpointUrl = `/messages?session_id=${sessionId}`;
        
        // 发送 endpoint 事件（这是 fastmcp 客户端期望的格式）
        res.write(`event: endpoint\n`);
        res.write(`data: ${endpointUrl}\n\n`);
        
        // 立即刷新
        if (typeof res.flush === 'function') {
            res.flush();
        }

        // 生成连接 ID
        let connectionId = sessionId;
        
        let connRecord: {
            res: any;
            sessionId: string;
            connectedAt: Date;
            heartbeatInterval: ReturnType<typeof setInterval> | null;
        } = {
            res,
            sessionId,
            connectedAt: new Date(),
            heartbeatInterval: null,
        };
        this.sseConnections.set(connectionId, connRecord);

        // 清理函数
        let cleanup = () => {
            this.sseConnections.delete(connectionId);
            if (connRecord.heartbeatInterval) {
                clearInterval(connRecord.heartbeatInterval);
                connRecord.heartbeatInterval = null;
            }
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
        connRecord.heartbeatInterval = setInterval(() => {
            try {
                if (this.sseConnections.has(connectionId)) {
                    let now = new Date().toISOString();
                    res.write(`: ping - ${now}\n\n`);
                    if (typeof res.flush === 'function') {
                        res.flush();
                    }
                } else {
                    cleanup();
                }
            } catch (error) {
                cleanup();
            }
        }, 30000); // 30秒心跳
    }

    /**
     * 处理 MCP 消息
     * 通过 SSE 连接发送响应
     */
    async handleMCPMessage(req: any, res: any) {
        try {
            // 从查询参数获取 session_id
            let parsedUrl = url.parse(req.url || '', true);
            let sessionId = parsedUrl.query.session_id as string;

            let body = await readHttpBody(req);
            let request: any = {};
            
            try {
                request = JSON.parse(body);
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

            let method = request.method;
            let params = request.params || {};
            let id = request.id;

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
                    let tools = await this.tools.getMCPToolsList();
                    response.result = { tools };
                } catch (error: any) {
                    console.error('✗ Error listing tools:', error);
                    response.error = {
                        code: -32603,
                        message: 'Internal error',
                        data: error.message
                    };
                }
                
            } else if (method === 'tools/call') {
                let toolName = params.name;
                let toolArguments = params.arguments || {};

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

                        let result = await this.templater.parse_templater(
                            scriptFile,
                            true,
                            toolArguments,
                            null,
                            ''
                        );

                        let content = result.map((item: any) => {
                            if (typeof item === 'object' && item !== null) {
                                return item;
                            }
                            return {
                                type: 'text',
                                text: String(item || '')
                            };
                        });

                        response.result = { content: content };
                        
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
                let conn = this.sseConnections.get(sessionId);
                let sseRes = conn.res;
                
                try {
                    // 发送响应
                    let jsonData = JSON.stringify(response);
                    sseRes.write(`data: ${jsonData}\n\n`);
                    if (typeof sseRes.flush === 'function') {
                        sseRes.flush();
                    }
                    sentViaSSE = true;
                    
                    // 如果是 initialize，发送 initialized 通知
                    if (method === 'initialize') {
                        let notification = {
                            jsonrpc: '2.0',
                            method: 'notifications/initialized',
                            params: {}
                        };
                        let notificationData = JSON.stringify(notification);
                        sseRes.write(`data: ${notificationData}\n\n`);
                        if (typeof sseRes.flush === 'function') {
                            sseRes.flush();
                        }
                    }
                } catch (error) {
                    console.error('✗ Failed to send via SSE:', error);
                    this.sseConnections.delete(sessionId);
                }
            } else {
                // 如果没有 session_id，尝试发送到任意活跃连接
                for (let [connId, conn] of this.sseConnections.entries()) {
                    try {
                        let sseRes = conn.res;
                        let jsonData = JSON.stringify(response);
                        sseRes.write(`data: ${jsonData}\n\n`);
                        if (typeof sseRes.flush === 'function') {
                            sseRes.flush();
                        }
                        sentViaSSE = true;
                        
                        if (method === 'initialize') {
                            let notification = {
                                jsonrpc: '2.0',
                                method: 'notifications/initialized',
                                params: {}
                            };
                            let notificationData = JSON.stringify(notification);
                            sseRes.write(`data: ${notificationData}\n\n`);
                            if (typeof sseRes.flush === 'function') {
                                sseRes.flush();
                            }
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
}
