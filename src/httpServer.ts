import { App, TFile } from 'obsidian';
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

/** 浏览器内搜索、查看、编辑库内 Markdown 笔记 */
const ONLINE_PAGE_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>在线笔记</title>
    <style>
        :root { color-scheme: light dark; }
        body { font-family: system-ui, -apple-system, sans-serif; max-width: 960px; margin: 0 auto; padding: 1rem 1.25rem 2rem; line-height: 1.45; }
        h1 { font-size: 1.35rem; margin: 0 0 1rem; font-weight: 600; }
        .row { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; margin-bottom: 0.75rem; }
        input[type="search"], input[type="text"] { flex: 1; min-width: 200px; padding: 0.5rem 0.65rem; border-radius: 6px; border: 1px solid #8884; box-sizing: border-box; }
        button { padding: 0.45rem 0.85rem; border-radius: 6px; border: none; cursor: pointer; font-size: 0.95rem; }
        button.primary { background: #2d7d46; color: #fff; }
        button.primary:hover { filter: brightness(1.08); }
        button.secondary { background: #4443; color: inherit; }
        button.secondary:hover { background: #4445; }
        button:disabled { opacity: 0.5; cursor: not-allowed; }
        #results { list-style: none; padding: 0; margin: 0 0 1rem; max-height: 220px; overflow: auto; border: 1px solid #8883; border-radius: 8px; }
        #results li { padding: 0.45rem 0.65rem; cursor: pointer; border-bottom: 1px solid #8882; }
        #results li:last-child { border-bottom: none; }
        #results li:hover, #results li.active { background: #08f2; }
        .path { font-size: 0.8rem; opacity: 0.75; }
        .panel { border: 1px solid #8883; border-radius: 8px; padding: 0.75rem 1rem; min-height: 200px; }
        .toolbar { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.6rem; flex-wrap: wrap; }
        .current { font-size: 0.85rem; opacity: 0.85; word-break: break-all; flex: 1; }
        #viewer { white-space: pre-wrap; word-break: break-word; margin: 0; font-family: ui-monospace, monospace; font-size: 0.88rem; max-height: 60vh; overflow: auto; }
        #editor { width: 100%; min-height: 320px; box-sizing: border-box; padding: 0.6rem; font-family: ui-monospace, monospace; font-size: 0.88rem; border-radius: 6px; border: 1px solid #8884; resize: vertical; }
        .msg { font-size: 0.9rem; margin-top: 0.5rem; }
        .msg.err { color: #c22; }
        .msg.ok { color: #2a7; }
        .hidden { display: none !important; }
    </style>
</head>
<body>
    <h1>在线查看 / 编辑笔记</h1>
    <div class="row">
        <input type="search" id="q" placeholder="按路径或标题搜索…" autocomplete="off">
        <button type="button" class="primary" id="btnSearch">搜索</button>
    </div>
    <ul id="results"></ul>
    <div class="panel">
        <div class="toolbar">
            <span class="current" id="currentLabel">未选择笔记</span>
            <button type="button" class="secondary hidden" id="btnView">查看</button>
            <button type="button" class="secondary hidden" id="btnEdit">编辑</button>
            <button type="button" class="primary hidden" id="btnSave">保存</button>
        </div>
        <pre id="viewer" class="hidden"></pre>
        <textarea id="editor" class="hidden" spellcheck="false"></textarea>
    </div>
    <p class="msg" id="msg"></p>
    <script>
(function () {
    var q = document.getElementById('q');
    var btnSearch = document.getElementById('btnSearch');
    var results = document.getElementById('results');
    var currentLabel = document.getElementById('currentLabel');
    var btnView = document.getElementById('btnView');
    var btnEdit = document.getElementById('btnEdit');
    var btnSave = document.getElementById('btnSave');
    var viewer = document.getElementById('viewer');
    var editor = document.getElementById('editor');
    var msg = document.getElementById('msg');
    var currentPath = '';
    var mode = 'none';

    function setMsg(text, kind) {
        msg.textContent = text || '';
        msg.className = 'msg' + (kind ? ' ' + kind : '');
    }

    function showToolbar(hasNote) {
        btnView.classList.toggle('hidden', !hasNote);
        btnEdit.classList.toggle('hidden', !hasNote);
        btnSave.classList.toggle('hidden', mode !== 'edit');
    }

    function setMode(m) {
        mode = m;
        viewer.classList.toggle('hidden', m !== 'view');
        editor.classList.toggle('hidden', m !== 'edit');
        btnSave.classList.toggle('hidden', m !== 'edit');
        btnView.classList.toggle('hidden', !currentPath);
        btnEdit.classList.toggle('hidden', !currentPath);
    }

    async function search() {
        var term = q.value.trim();
        setMsg('');
        results.innerHTML = '';
        if (!term) { setMsg('请输入搜索关键词', 'err'); return; }
        btnSearch.disabled = true;
        try {
            var res = await fetch('/online/api/search?q=' + encodeURIComponent(term));
            var data = await res.json();
            if (!res.ok) throw new Error(data.error || res.statusText);
            var list = data.results || [];
            if (list.length === 0) { setMsg('没有匹配的笔记'); return; }
            list.forEach(function (item) {
                var li = document.createElement('li');
                li.dataset.path = item.path;
                li.innerHTML = '<strong>' + escapeHtml(item.basename) + '</strong><div class="path">' + escapeHtml(item.path) + '</div>';
                li.onclick = function () { selectItem(li, item.path); };
                results.appendChild(li);
            });
        } catch (e) {
            setMsg('搜索失败：' + e.message, 'err');
        } finally {
            btnSearch.disabled = false;
        }
    }

    function escapeHtml(s) {
        var d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    function selectItem(li, path) {
        Array.prototype.forEach.call(results.querySelectorAll('li'), function (x) { x.classList.remove('active'); });
        if (li) li.classList.add('active');
        loadNote(path);
    }

    async function loadNote(path) {
        setMsg('');
        currentPath = path;
        currentLabel.textContent = path;
        showToolbar(true);
        setMode('view');
        viewer.textContent = '加载中…';
        viewer.classList.remove('hidden');
        try {
            var res = await fetch('/online/api/note?path=' + encodeURIComponent(path));
            var data = await res.json();
            if (!res.ok) throw new Error(data.error || res.statusText);
            viewer.textContent = data.content || '';
            editor.value = data.content || '';
        } catch (e) {
            viewer.textContent = '';
            setMsg('读取失败：' + e.message, 'err');
            currentPath = '';
            currentLabel.textContent = '未选择笔记';
            showToolbar(false);
            setMode('none');
        }
    }

    btnSearch.onclick = search;
    q.onkeydown = function (e) { if (e.key === 'Enter') search(); };

    btnView.onclick = function () {
        if (!currentPath) return;
        setMode('view');
        viewer.textContent = editor.value;
    };

    btnEdit.onclick = function () {
        if (!currentPath) return;
        setMode('edit');
    };

    btnSave.onclick = async function () {
        if (!currentPath) return;
        setMsg('');
        btnSave.disabled = true;
        try {
            var res = await fetch('/online/api/note', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: currentPath, content: editor.value })
            });
            var data = await res.json().catch(function () { return {}; });
            if (!res.ok) throw new Error(data.error || res.statusText);
            setMsg('已保存', 'ok');
            viewer.textContent = editor.value;
            setMode('view');
        } catch (e) {
            setMsg('保存失败：' + e.message, 'err');
        } finally {
            btnSave.disabled = false;
        }
    };
})();
    </script>
</body>
</html>`;

export class HTTPServer {
    private app: App;
    private templater: Templater;
    private server: any = null;
    /** 合并并发 stop，且避免对同一 server 调用两次 close() */
    private stopPromise: Promise<void> | null = null;
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
                    } else if (parsedUrl.pathname === '/mcp/skill' && req.method === 'GET') {
                        await this.handleMCPSkill(req, res);
                    } else if (parsedUrl.pathname === '/online' && req.method === 'GET') {
                        await this.handleOnlinePage(req, res);
                    } else if (parsedUrl.pathname === '/online/api/search' && req.method === 'GET') {
                        await this.handleOnlineSearch(req, res, parsedUrl);
                    } else if (parsedUrl.pathname === '/online/api/note' && req.method === 'GET') {
                        await this.handleOnlineNoteGet(req, res, parsedUrl);
                    } else if (parsedUrl.pathname === '/online/api/note' && req.method === 'POST') {
                        await this.handleOnlineNoteSave(req, res);
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

    /**
     * 生成供 Agent 使用的 MCP Skill 文档（SKILL.md 内容）。
     * @param baseUrl 例如 http://127.0.0.1:3000
     * @param tools 可选，当前支持的工具列表；传入时会生成表格并写入「先用表格、不够再 list_tools、找不到则告知无法完成」的流程说明
     */
    getMCPSkillMarkdown(baseUrl: string, tools?: any[]): string {
        const base = baseUrl.replace(/\/$/, '');
        const toolsTable =
            tools && tools.length > 0
                ? `
## Currently supported tools (at skill generation time)

| Name | Description | inputSchema |
|------|-------------|-------------|
${tools.map((t) => {
            const name = (t.name ?? '').replace(/\|/g, '\\|');
            const desc = (t.description ?? '').replace(/\n/g, ' ').replace(/\|/g, '\\|').trim();
            const schemaStr = typeof t.inputSchema === 'object'
                ? JSON.stringify(t.inputSchema).replace(/\n/g, ' ').replace(/\|/g, '\\|')
                : (t.inputSchema ?? '{}').replace(/\n/g, ' ').replace(/\|/g, '\\|');
            return `| ${name} | ${desc || '-'} | \`${schemaStr}\` |`;
        }).join('\n')}

### Full tool definitions (name, description, inputSchema)

${tools.map((t) => {
            const name = t.name ?? '';
            const desc = t.description ?? '';
            const schema = t.inputSchema != null ? (typeof t.inputSchema === 'object' ? JSON.stringify(t.inputSchema, null, 2) : String(t.inputSchema)) : '{}';
            return `**${name}**\n- Description: ${desc || '-'}\n- inputSchema:\n\`\`\`json\n${schema}\n\`\`\``;
        }).join('\n\n')}

**Workflow:**
1. Prefer the tools in the table above. If one fits the user's request, call it via \`POST ${base}/mcp/call_tool\`.
2. If no listed tool fits, call **GET or POST** \`${base}/mcp/list_tools\` to get the latest tool list (new tools may have been added).
3. If after that you still find no suitable tool, **tell the user clearly that the task cannot be completed** with the current MCP tools.
`
                : '';

        return `---
name: obsidian-note-chain-mcp
description: Call Obsidian MCP tools via Note-Chain HTTP server. Use when the user or task needs to list available MCP tools, call a tool (e.g. get current note, search vault), or integrate with Obsidian from an agent. Requires the Note-Chain HTTP server running at the given base URL.
---

# Note-Chain MCP Agent Skill

Call MCP tools exposed by the Note-Chain plugin over HTTP. Base URL must point to a running Note-Chain server (e.g. \`http://127.0.0.1:3000\`).

## Base URL

\`\`\`
${base}
\`\`\`
${toolsTable}
## List tools (when table is not enough)

**GET or POST** \`${base}/mcp/list_tools\`

Returns \`{ "tools": [ { "name", "description", "inputSchema" }, ... ] }\`.

\`\`\`javascript
const res = await fetch(\`${base}/mcp/list_tools\`);
const data = await res.json();
console.log(data.tools);
\`\`\`

## Call a tool

**POST** \`${base}/mcp/call_tool\`

Body (JSON):

\`\`\`json
{
  "name": "tool_name_without_md",
  "arguments": { "key": "value" }
}
\`\`\`

Returns \`{ "content": [ { "type": "text", "text": "..." } ] }\`.

\`\`\`javascript
const response = await fetch(\`${base}/mcp/call_tool\`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'get_current_note',
    arguments: { query: 'test' }
  })
});
const data = await response.json();
console.log(data.content);
\`\`\`

## Test page

Open in browser: \`${base}/mcp/test\` to try listing and calling tools from a form.
`;
    }

    /** 异步生成 SKILL 内容（含当前工具表格），供 HTTP 与命令使用 */
    async getMCPSkillMarkdownAsync(baseUrl: string): Promise<string> {
        const tools = await this.getMCPToolsList();
        return this.getMCPSkillMarkdown(baseUrl, tools);
    }

    /** GET /mcp/skill 返回 SKILL.md 内容，便于 Agent 或用户复制 */
    private async handleMCPSkill(req: any, res: any) {
        const host = req.headers.host || `127.0.0.1:${this.port}`;
        const baseUrl = `http://${host}`;
        const markdown = await this.getMCPSkillMarkdownAsync(baseUrl);
        res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
        res.end(markdown);
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

    /** 在线页：仅允许 vault 相对路径，拒绝明显越界 */
    private normalizeOnlineVaultPath(raw: string | undefined): string | null {
        if (!raw || typeof raw !== 'string') {
            return null;
        }
        let p = raw.replace(/\\/g, '/').trim();
        if (p.includes('..')) {
            return null;
        }
        while (p.startsWith('/')) {
            p = p.slice(1);
        }
        return p.length ? p : null;
    }

    private async handleOnlinePage(req: any, res: any) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(ONLINE_PAGE_HTML);
    }

    private async handleOnlineSearch(req: any, res: any, parsedUrl: any) {
        try {
            let qRaw = parsedUrl.query && (parsedUrl.query.q as string | undefined);
            let term = (qRaw || '').trim().toLowerCase();
            if (!term) {
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ results: [] }));
                return;
            }
            let files = this.app.vault.getMarkdownFiles();
            let hits: { path: string; basename: string }[] = [];
            for (let f of files) {
                let pathLower = f.path.toLowerCase();
                let baseLower = f.basename.toLowerCase();
                if (pathLower.includes(term) || baseLower.includes(term)) {
                    hits.push({ path: f.path, basename: f.basename });
                }
            }
            hits.sort((a, b) => a.path.localeCompare(b.path));
            let limit = 100;
            if (hits.length > limit) {
                hits = hits.slice(0, limit);
            }
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ results: hits }));
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: error.message || 'search failed' }));
        }
    }

    private resolveOnlineMarkdownFile(pathParam: string | undefined): TFile | null {
        let p = this.normalizeOnlineVaultPath(pathParam);
        if (!p) {
            return null;
        }
        let abs = this.app.vault.getAbstractFileByPath(p);
        if (!abs || !(abs instanceof TFile)) {
            return null;
        }
        if (abs.extension !== 'md') {
            return null;
        }
        return abs;
    }

    private async handleOnlineNoteGet(req: any, res: any, parsedUrl: any) {
        try {
            let pathParam = parsedUrl.query && (parsedUrl.query.path as string | undefined);
            let file = this.resolveOnlineMarkdownFile(pathParam);
            if (!file) {
                res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'Note not found or not a markdown file' }));
                return;
            }
            let content = await this.app.vault.read(file);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
                path: file.path,
                basename: file.basename,
                content
            }));
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: error.message || 'read failed' }));
        }
    }

    private async handleOnlineNoteSave(req: any, res: any) {
        try {
            let body = await this.readBody(req);
            let data: any = {};
            try {
                data = JSON.parse(body);
            } catch {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'Invalid JSON body' }));
                return;
            }
            let file = this.resolveOnlineMarkdownFile(data.path);
            if (!file) {
                res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'Note not found or not a markdown file' }));
                return;
            }
            let content = typeof data.content === 'string' ? data.content : '';
            await this.app.vault.modify(file, content);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: true, path: file.path }));
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: error.message || 'save failed' }));
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

            // 立刻拆掉普通 HTTP 的 keep-alive 连接，否则 close() 可能卡到 keepAliveTimeout（默认很长）
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