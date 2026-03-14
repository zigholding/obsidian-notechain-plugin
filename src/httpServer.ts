import { App } from 'obsidian';
import { Templater } from './easyapi/templater';

let http = require('http');
let url = require('url');

const MCP_TEST_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MCP call_tool 测试</title>
    <style>
        body { font-family: system-ui, sans-serif; max-width: 640px; margin: 2rem auto; padding: 0 1rem; }
        input, button { padding: 0.5rem 0.75rem; margin: 0.25rem 0; }
        input[type="url"] { width: 100%; box-sizing: border-box; }
        button { cursor: pointer; background: #4a9; color: #fff; border: none; border-radius: 4px; }
        button:hover { background: #3a8; }
        pre { background: #f4f4f4; padding: 1rem; overflow: auto; border-radius: 4px; white-space: pre-wrap; }
        .error { color: #c00; }
    </style>
</head>
<body>
    <h1>MCP call_tool 测试</h1>
    <p>
        <label>接口地址：<br>
            <input type="url" id="baseUrl" value="__BASE_URL__" placeholder="http://127.0.0.1:3000">
        </label>
    </p>
    <p>
        <label>工具名：<br>
            <input type="text" id="toolName" value="get_current_note" placeholder="get_current_note">
        </label>
    </p>
    <p>
        <label>参数 (JSON)：<br>
            <input type="text" id="toolArgs" value='{"query": "test"}' placeholder='{"query": "test"}'>
        </label>
    </p>
    <p>
        <button id="btn">调用 call_tool</button>
    </p>
    <p id="out"></p>
    <script>
        document.getElementById('btn').onclick = async function () {
            var base = document.getElementById('baseUrl').value.replace(/\\/$/, '');
            var name = document.getElementById('toolName').value.trim();
            var argsStr = document.getElementById('toolArgs').value.trim();
            var out = document.getElementById('out');
            var args = {};
            if (argsStr) {
                try { args = JSON.parse(argsStr); } catch (e) {
                    out.innerHTML = '<pre class="error">参数不是合法 JSON：' + e.message + '</pre>';
                    return;
                }
            }
            var url = base + '/mcp/call_tool';
            out.innerHTML = '<pre>请求中… ' + url + '</pre>';
            try {
                var res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: name, arguments: args })
                });
                var text = await res.text();
                var data;
                try { data = JSON.parse(text); } catch (_) { data = text; }
                out.innerHTML = (res.ok ? '' : '<pre class="error">HTTP ' + res.status + '</pre>') +
                    '<pre>' + (typeof data === 'object' ? JSON.stringify(data, null, 2) : data) + '</pre>';
            } catch (e) {
                out.innerHTML = '<pre class="error">请求失败：' + e.message + '</pre>';
            }
        };
    </script>
</body>
</html>`;

export class HTTPServer {
    private app: App;
    private templater: Templater;
    private server: any = null;
    private port: number;
    private host: string;
    private sseConnections: Map<string, any> = new Map();

    constructor(app: App, templater: Templater, host: string = '0.0.0.0', port: number = 3000) {
        this.app = app;
        this.templater = templater;
        this.host = host;
        this.port = port;
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
                    let parsedUrl = url.parse(req.url || '', true);
                    
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
                    } else if (parsedUrl.pathname === '/mcp/test' && req.method === 'GET') {
                        await this.handleMCPTestPage(req, res);
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
                let body = await this.readBody(req);
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
                    let parts = idxStr.split(',').map(p => parseInt(p.trim())).filter(n => !isNaN(n));
                    if (parts.length > 0) {
                        idx = parts;
                    }
                }
            }

            let template = filename || '';
            let result = await this.templater.parse_templater(
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

    /**
     * 获取 MCP 工具列表：优先使用 obsidian_mcp_list_tools.md，不存在时从 vault 中扫描
     * frontmatter.mcp_tool 或文件名 mcp_ 前缀的 markdown 作为工具。
     */
    private async getMCPToolsList(): Promise<any[]> {
        
        let listToolsFileName = 'obsidian_mcp_list_tools.md';
        let listToolsFile = (this.app as any).plugins.getPlugin('note-chain').easyapi.file.get_tfile(listToolsFileName);

        if (listToolsFile) {
            try {
                let result = await this.templater.parse_templater(
                    listToolsFileName,
                    true,
                    null,
                    null,
                    ''
                );
                if (result && result.length > 0) {
                    let resultStr = result.join('\n').trim();
                    try {
                        let parsed = JSON.parse(resultStr);
                        if (Array.isArray(parsed)) return parsed;
                        if (parsed && Array.isArray(parsed.tools)) return parsed.tools;
                        if (typeof parsed === 'object') return [parsed];
                    } catch {
                        console.warn('list_tools script returned invalid JSON');
                    }
                }
            } catch (e) {
                console.warn('obsidian_mcp_list_tools.md parse failed, using fallback', e);
            }
        }

        // 回退：从 vault 中扫描 mcp_tool frontmatter 或 mcp_ 前缀文件
        let tools: any[] = [];
        let tfiles = this.app.vault.getMarkdownFiles();

        for (let file of tfiles) {
            let cache = this.app.metadataCache.getFileCache(file);
            if (!cache) continue;

            if (cache.frontmatter && cache.frontmatter.mcp_tool) {
                let toolName = file.basename;
                let description = cache.frontmatter.description || '';
                let inputSchema = cache.frontmatter.inputSchema || {
                    type: 'object',
                    properties: {},
                    required: []
                };
                if (cache.frontmatter.mcp_tool && (cache.frontmatter.mcp_tool as any).name) {
                    toolName = (cache.frontmatter.mcp_tool as any).name;
                }
                tools.push({ name: toolName, description, inputSchema });
            }

            if (file.basename.startsWith('mcp_') && !file.basename.includes('list_tools')) {
                tools.push({
                    name: file.basename,
                    description: `工具: ${file.basename}`,
                    inputSchema: { type: 'object', properties: {}, required: [] }
                });
            }
        }

        return tools;
    }

    private async handleMCPListTools(req: any, res: any) {
        try {
            let tools = await this.getMCPToolsList();
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ tools }, null, 2));
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: 'Failed to list tools',
                message: error.message || 'Unknown error',
                stack: error.stack
            }));
        }
    }

    /** 提供 MCP call_tool 测试页面，浏览器访问 /mcp/test 即可 */
    private async handleMCPTestPage(req: any, res: any) {
        const host = req.headers.host || `127.0.0.1:${this.port}`;
        const baseUrl = `http://${host}`;
        const html = MCP_TEST_HTML.replace('__BASE_URL__', baseUrl);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
    }

    private async handleMCPCallTool(req: any, res: any) {
        try {
            let body = await this.readBody(req);
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
    private async handleSSEConnection(req: any, res: any) {
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
        
        // 保存连接
        this.sseConnections.set(connectionId, {
            res: res,
            sessionId: sessionId,
            connectedAt: new Date()
        });

        // 清理函数
        let cleanup = () => {
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
        let heartbeatInterval = setInterval(() => {
            try {
                if (this.sseConnections.has(connectionId)) {
                    let now = new Date().toISOString();
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
    }

    /**
     * 处理 MCP 消息
     * 通过 SSE 连接发送响应
     */
    private async handleMCPMessage(req: any, res: any) {
        try {
            // 从查询参数获取 session_id
            let parsedUrl = url.parse(req.url || '', true);
            let sessionId = parsedUrl.query.session_id as string;

            let body = await this.readBody(req);
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
                    let tools = await this.getMCPToolsList();
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
                for (let [connId, conn] of this.sseConnections.entries()) {
                    try {
                        conn.res.end();
                    } catch (e) {
                        // 忽略错误
                    }
                }
                this.sseConnections.clear();
                
                this.server.close(() => {
                    this.server = null;
                    resolve();
                });
            } else {
                resolve();
            }
        });
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