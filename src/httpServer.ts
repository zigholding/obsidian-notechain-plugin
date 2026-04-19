import { App, Component, MarkdownRenderer, TFile, normalizePath } from 'obsidian';
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
        /* 在线预览：结构由 MarkdownRenderer 生成，样式接近 Obsidian 阅读视图 */
        #viewer.obsidian-online-render {
            max-height: 60vh; overflow: auto; margin: 0; padding: 0.35rem 0.15rem;
            font-size: 16px; line-height: 1.6; text-align: left;
            --on-text: #1e1e1e; --on-muted: #5c5c5c; --on-border: #d4d4d4; --on-code-bg: #f3f3f3; --on-link: #0969da;
        }
        @media (prefers-color-scheme: dark) {
            #viewer.obsidian-online-render {
                --on-text: #dcddde; --on-muted: #a0a4a8; --on-border: #3d3d3d; --on-code-bg: #2a2a2a; --on-link: #79c0ff;
            }
        }
        #viewer.obsidian-online-render { color: var(--on-text); }
        #viewer.obsidian-online-render .online-loading { color: var(--on-muted); margin: 0.25rem 0; }
        #viewer.obsidian-online-render .markdown-rendered > :first-child { margin-top: 0; }
        #viewer.obsidian-online-render .markdown-rendered > :last-child { margin-bottom: 0; }
        #viewer.obsidian-online-render p { margin: 0.65em 0; }
        #viewer.obsidian-online-render h1 { font-size: 1.75em; font-weight: 600; margin: 0.75em 0 0.4em; line-height: 1.25; border-bottom: 1px solid var(--on-border); padding-bottom: 0.2em; }
        #viewer.obsidian-online-render h2 { font-size: 1.45em; font-weight: 600; margin: 0.7em 0 0.35em; line-height: 1.3; }
        #viewer.obsidian-online-render h3 { font-size: 1.2em; font-weight: 600; margin: 0.65em 0 0.3em; }
        #viewer.obsidian-online-render h4, #viewer.obsidian-online-render h5, #viewer.obsidian-online-render h6 { font-weight: 600; margin: 0.55em 0 0.25em; }
        #viewer.obsidian-online-render ul, #viewer.obsidian-online-render ol { margin: 0.55em 0; padding-left: 1.45em; }
        #viewer.obsidian-online-render li { margin: 0.2em 0; }
        #viewer.obsidian-online-render blockquote { margin: 0.6em 0; padding: 0 0 0 0.9em; border-left: 3px solid var(--on-border); color: var(--on-muted); }
        #viewer.obsidian-online-render hr { border: none; border-top: 1px solid var(--on-border); margin: 1em 0; }
        #viewer.obsidian-online-render code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.9em; padding: 0.12em 0.35em; border-radius: 4px; background: var(--on-code-bg); }
        #viewer.obsidian-online-render pre { margin: 0.65em 0; padding: 0.75rem 1rem; border-radius: 6px; background: var(--on-code-bg); overflow: auto; }
        #viewer.obsidian-online-render pre code { padding: 0; background: none; font-size: 0.85em; }
        #viewer.obsidian-online-render a.internal-link { color: var(--on-link); text-decoration: none; font-weight: 500; }
        #viewer.obsidian-online-render a.internal-link:hover { text-decoration: underline; }
        #viewer.obsidian-online-render a.external-link { color: var(--on-link); }
        #viewer.obsidian-online-render img { max-width: 100%; height: auto; border-radius: 4px; }
        #viewer.obsidian-online-render table { border-collapse: collapse; width: 100%; margin: 0.65em 0; font-size: 0.95em; }
        #viewer.obsidian-online-render th, #viewer.obsidian-online-render td { border: 1px solid var(--on-border); padding: 0.35em 0.55em; }
        #viewer.obsidian-online-render th { background: var(--on-code-bg); font-weight: 600; }
        #viewer.obsidian-online-render .callout { margin: 0.65em 0; padding: 0.5em 0.75em; border-radius: 6px; border: 1px solid var(--on-border); background: var(--on-code-bg); }
        #viewer.obsidian-online-render .callout-title { font-weight: 600; margin-bottom: 0.35em; }
        #viewer.obsidian-online-render .task-list-item-checkbox { margin-right: 0.4em; }
        #viewer.obsidian-online-render .textarea-container textarea.code_block_textarea { pointer-events: auto; }
        #viewer.obsidian-online-render .code_block_textarea_btn_container { pointer-events: auto; }
        #viewer.obsidian-online-render button.code_block_textarea_btn { cursor: pointer; }
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
        <div id="viewer" class="markdown-preview-view obsidian-online-render hidden" role="document"></div>
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

    function setMode(m) {
        mode = m;
        if (m === 'none') {
            viewer.innerHTML = '';
            viewer.classList.add('hidden');
            editor.classList.add('hidden');
            btnSave.classList.add('hidden');
            btnView.classList.add('hidden');
            btnEdit.classList.add('hidden');
            return;
        }
        viewer.classList.toggle('hidden', m !== 'view');
        editor.classList.toggle('hidden', m !== 'edit');
        btnSave.classList.toggle('hidden', m !== 'edit');
        // 查看态不显示「查看」；编辑态不显示「编辑」（编辑态显示「查看」可回到预览）
        btnView.classList.toggle('hidden', m !== 'edit' || !currentPath);
        btnEdit.classList.toggle('hidden', m !== 'view' || !currentPath);
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

    async function renderPreview(path, markdown) {
        var res = await fetch('/online/api/render', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/x-ndjson' },
            body: JSON.stringify({ path: path, markdown: markdown })
        });
        if (!res.ok) {
            var errText = await res.text();
            var errJson = {};
            try { errJson = JSON.parse(errText); } catch (_) {}
            throw new Error(errJson.error || res.statusText);
        }
        var ct = (res.headers.get('content-type') || '').toLowerCase();
        if (ct.indexOf('ndjson') < 0 || !res.body || !res.body.getReader) {
            var data = await res.json().catch(function () { return {}; });
            viewer.innerHTML = '<div class="markdown-rendered">' + (data.html || '') + '</div>';
            return;
        }
        var reader = res.body.getReader();
        var dec = new TextDecoder();
        var buf = '';
        while (true) {
            var rd = await reader.read();
            if (rd.done) break;
            buf += dec.decode(rd.value, { stream: true });
            for (;;) {
                var nl = buf.indexOf(String.fromCharCode(10));
                if (nl < 0) break;
                var line = buf.slice(0, nl).trim();
                buf = buf.slice(nl + 1);
                if (!line) continue;
                var frame = JSON.parse(line);
                if (frame.error) throw new Error(frame.error);
                viewer.innerHTML = '<div class="markdown-rendered">' + (frame.html || '') + '</div>';
                if (frame.done) return;
            }
        }
    }

    async function loadNote(path) {
        setMsg('');
        currentPath = path;
        currentLabel.textContent = path;
        setMode('view');
        viewer.innerHTML = '<p class="online-loading">加载…</p>';
        viewer.classList.remove('hidden');
        try {
            var res = await fetch('/online/api/note?path=' + encodeURIComponent(path));
            var data = await res.json();
            if (!res.ok) throw new Error(data.error || res.statusText);
            editor.value = data.content || '';
            await renderPreview(path, data.content || '');
        } catch (e) {
            viewer.innerHTML = '';
            setMsg('读取失败：' + e.message, 'err');
            currentPath = '';
            currentLabel.textContent = '未选择笔记';
            setMode('none');
        }
    }

    btnSearch.onclick = search;
    q.onkeydown = function (e) { if (e.key === 'Enter') search(); };

    btnView.onclick = async function () {
        if (!currentPath) return;
        setMode('view');
        viewer.innerHTML = '<p class="online-loading">渲染…</p>';
        try {
            await renderPreview(currentPath, editor.value);
        } catch (e) {
            setMsg('渲染失败：' + e.message, 'err');
        }
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
            setMode('view');
            viewer.innerHTML = '<p class="online-loading">渲染…</p>';
            try {
                await renderPreview(currentPath, editor.value);
            } catch (re) {
                setMsg('已保存，但预览渲染失败：' + re.message, 'err');
            }
        } catch (e) {
            setMsg('保存失败：' + e.message, 'err');
        } finally {
            btnSave.disabled = false;
        }
    };

    viewer.addEventListener('click', function (e) {
        var t = e.target;
        if (!t || !t.closest) return;
        var taBtn = t.closest('[data-nc-online-fname]');
        if (taBtn && currentPath) {
            var container = taBtn.closest('.textarea-container');
            var area = container && container.querySelector('textarea.code_block_textarea');
            if (!area) {
                area = container && container.querySelector('textarea:not(.nc-ta-block-meta)');
            }
            if (area) {
                e.preventDefault();
                e.stopPropagation();
                var fname = taBtn.getAttribute('data-nc-online-fname') || '';
                var ps = taBtn.getAttribute('data-nc-online-params');
                var params;
                if (ps) {
                    try { params = JSON.parse(ps); } catch (_) { params = undefined; }
                }
                var meta = container.querySelector('textarea.nc-ta-block-meta');
                var src = meta ? meta.value : '';
                if (fname === 'clear_area') {
                    area.value = '';
                    setMsg('', '');
                    return;
                }
                if (fname === 'copy_area') {
                    area.select();
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(area.value).then(function () {
                            setMsg('已复制', 'ok');
                        }).catch(function () {
                            setMsg('复制失败', 'err');
                        });
                    } else {
                        try {
                            document.execCommand('copy');
                            setMsg('已复制', 'ok');
                        } catch (x) {
                            setMsg('复制失败', 'err');
                        }
                    }
                    return;
                }
                if (fname === 'log_area') {
                    console.log('[Online textarea]', area.value);
                    setMsg('已输出到控制台', 'ok');
                    return;
                }
                setMsg('处理中…', '');
                fetch('/online/api/textarea-exec', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        path: currentPath,
                        fname: fname,
                        textareaValue: area.value,
                        source: src,
                        params: params
                    })
                })
                    .then(function (res) { return res.json().then(function (d) { return { res: res, d: d }; }); })
                    .then(function (x) {
                        if (!x.res.ok) {
                            setMsg(x.d.error || '请求失败', 'err');
                            return;
                        }
                        var d = x.d;
                        if (d.newValue !== undefined && d.newValue !== null) {
                            area.value = String(d.newValue);
                        }
                        if (d.notice) {
                            setMsg(d.notice, 'ok');
                        } else {
                            setMsg('', '');
                        }
                    })
                    .catch(function (err) {
                        setMsg(err.message || '请求失败', 'err');
                    });
                return;
            }
        }
        var a = t.closest('a.internal-link');
        if (!a || !currentPath) return;
        e.preventDefault();
        var href = a.getAttribute('href') || '';
        if (!href) return;
        fetch('/online/api/resolve-link?from=' + encodeURIComponent(currentPath) + '&to=' + encodeURIComponent(href))
            .then(function (res) { return res.json().then(function (d) { return { res: res, d: d }; }); })
            .then(function (x) {
                if (!x.res.ok || !x.d.path) return;
                loadNote(x.d.path);
            });
    });
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
                    } else if (parsedUrl.pathname === '/online/api/render' && req.method === 'POST') {
                        await this.handleOnlineRender(req, res);
                    } else if (parsedUrl.pathname === '/online/api/resolve-link' && req.method === 'GET') {
                        await this.handleOnlineResolveLink(req, res, parsedUrl);
                    } else if (parsedUrl.pathname === '/online/api/media' && req.method === 'GET') {
                        await this.handleOnlineMedia(req, res, parsedUrl);
                    } else if (parsedUrl.pathname === '/online/api/textarea-exec' && req.method === 'POST') {
                        await this.handleOnlineTextareaExec(req, res);
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

    private getVaultRootAbsNorm(): string | null {
        let adapter = this.app.vault.adapter as any;
        let getFullPath = adapter.getFullPath as undefined | ((p: string) => string);
        if (typeof getFullPath !== 'function') {
            return null;
        }
        for (let key of ['.', '']) {
            try {
                let abs = getFullPath.call(adapter, key);
                if (abs && typeof abs === 'string') {
                    return abs.replace(/\\/g, '/');
                }
            } catch {
                // try next
            }
        }
        return null;
    }

    private absPathToVaultRel(fsPathRaw: string): string | null {
        let fsPath = fsPathRaw.replace(/\\/g, '/').trim();
        let root = this.getVaultRootAbsNorm();
        if (!root) {
            return null;
        }
        let lowerRoot = root.toLowerCase();
        let lowerPath = fsPath.toLowerCase();
        if (!lowerPath.startsWith(lowerRoot)) {
            return null;
        }
        let rest = fsPath.slice(root.length).replace(/^\/+/, '');
        if (!rest.length || rest.includes('..')) {
            return null;
        }
        let f = this.app.vault.getAbstractFileByPath(rest);
        return f instanceof TFile ? rest : null;
    }

    private joinMediaPathFromSource(sourcePath: string, href: string): string | null {
        let h = href.trim();
        if (!h.length) {
            return null;
        }
        if (/^[a-z][a-z0-9+.-]*:\/\//i.test(h)) {
            return null;
        }
        let dir = '';
        if (sourcePath.includes('/')) {
            dir = sourcePath.slice(0, sourcePath.lastIndexOf('/'));
        }
        let joined = dir.length ? normalizePath(dir + '/' + h) : normalizePath(h);
        joined = joined.replace(/\\/g, '/');
        let norm = this.normalizeOnlineVaultPath(joined);
        if (!norm) {
            return null;
        }
        let f = this.app.vault.getAbstractFileByPath(norm);
        return f instanceof TFile ? norm : null;
    }

    /** app://…、file://… 转为 vault 相对路径 */
    private resolveSpecialUrlToVaultPath(raw: string): string | null {
        let s = raw.trim();
        try {
            s = decodeURIComponent(s);
        } catch {
            // keep
        }
        if (!s.length) {
            return null;
        }
        if (/^app:\/\/local\//i.test(s)) {
            let tail = s.slice('app://local/'.length);
            try {
                tail = decodeURIComponent(tail.replace(/\+/g, '%20'));
            } catch {
                // keep
            }
            let fsNorm = tail.replace(/\\/g, '/');
            return this.absPathToVaultRel(fsNorm);
        }
        let mHost = s.match(/^app:\/\/[^/]+\/(.+)$/i);
        if (mHost) {
            let rest = mHost[1];
            try {
                rest = decodeURIComponent(rest.replace(/\+/g, '%20'));
            } catch {
                // keep
            }
            rest = rest.replace(/\\/g, '/').replace(/^\/+/, '');
            if (!rest.includes('..')) {
                let f = this.app.vault.getAbstractFileByPath(rest);
                if (f instanceof TFile) {
                    return rest;
                }
                let byAbs = this.absPathToVaultRel(rest);
                if (byAbs) {
                    return byAbs;
                }
            }
        }
        if (/^file:\/\//i.test(s)) {
            let p = s.replace(/^file:\/\//i, '');
            if (p.startsWith('///')) {
                p = p.slice(2);
            } else if (p.startsWith('//')) {
                p = p.slice(1);
            }
            try {
                p = decodeURIComponent(p);
            } catch {
                // keep
            }
            let fsNorm = p.replace(/\\/g, '/');
            return this.absPathToVaultRel(fsNorm);
        }
        return null;
    }

    private resolveSrcToVaultPathForOnline(src: string, sourcePath: string): string | null {
        if (!src.trim().length || src.includes('/online/api/media?')) {
            return null;
        }
        let decoded = src.trim();
        try {
            decoded = decodeURIComponent(decoded);
        } catch {
            // keep
        }
        if (/^(app|file):/i.test(decoded)) {
            return this.resolveSpecialUrlToVaultPath(decoded);
        }
        if (/^https?:\/\//i.test(decoded)) {
            return null;
        }
        let rel = this.joinMediaPathFromSource(sourcePath, decoded);
        if (rel) {
            return rel;
        }
        let only = this.normalizeOnlineVaultPath(decoded.replace(/\\/g, '/'));
        if (only) {
            let f = this.app.vault.getAbstractFileByPath(only);
            if (f instanceof TFile) {
                return only;
            }
        }
        return null;
    }

    private rewriteOnlinePreviewHtml(html: string, sourcePath: string): string {
        if (!html.length) {
            return html;
        }
        let wrap = document.createElement('div');
        wrap.innerHTML = html;
        let sel = 'img[src], video[src], audio[src], source[src]';
        wrap.querySelectorAll(sel).forEach((node) => {
            let src = node.getAttribute('src');
            if (!src) {
                return;
            }
            let vaultPath = this.resolveSrcToVaultPathForOnline(src, sourcePath);
            if (vaultPath) {
                node.setAttribute('src', '/online/api/media?path=' + encodeURIComponent(vaultPath));
            }
        });
        wrap.querySelectorAll('img[data-src], video[data-src]').forEach((node) => {
            let ds = node.getAttribute('data-src');
            if (!ds) {
                return;
            }
            let vaultPath = this.resolveSrcToVaultPathForOnline(ds, sourcePath);
            if (vaultPath) {
                node.setAttribute('data-src', '/online/api/media?path=' + encodeURIComponent(vaultPath));
            }
        });
        return wrap.innerHTML;
    }

    private onlineMediaMime(extension: string): string {
        let ext = (extension || '').toLowerCase().replace(/^\./, '');
        let map: Record<string, string> = {
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            gif: 'image/gif',
            webp: 'image/webp',
            svg: 'image/svg+xml',
            ico: 'image/x-icon',
            bmp: 'image/bmp',
            avif: 'image/avif',
            mp4: 'video/mp4',
            webm: 'video/webm',
            ogv: 'video/ogg',
            mp3: 'audio/mpeg',
            wav: 'audio/wav',
            ogg: 'audio/ogg',
            pdf: 'application/pdf',
            woff: 'font/woff',
            woff2: 'font/woff2',
        };
        return map[ext] || 'application/octet-stream';
    }

    private async handleOnlineMedia(req: any, res: any, parsedUrl: any) {
        try {
            let pathParam = parsedUrl.query && (parsedUrl.query.path as string | undefined);
            let p = this.normalizeOnlineVaultPath(pathParam);
            if (!p) {
                res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Bad path');
                return;
            }
            let abs = this.app.vault.getAbstractFileByPath(p);
            if (!abs || !(abs instanceof TFile)) {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Not found');
                return;
            }
            let raw = await this.app.vault.readBinary(abs);
            let body =
                raw instanceof ArrayBuffer
                    ? Buffer.from(raw)
                    : Buffer.isBuffer(raw)
                      ? raw
                      : Buffer.from(raw as Uint8Array);
            res.writeHead(200, {
                'Content-Type': this.onlineMediaMime(abs.extension),
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=3600',
            });
            res.end(body);
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(error.message || 'read failed');
        }
    }

    /** 与 NCTextarea 按钮逻辑对齐：命令 / get_str_func / templater 文件（Online 浏览器端交互） */
    private async handleOnlineTextareaExec(req: any, res: any) {
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
            let pathNorm = this.normalizeOnlineVaultPath(data.path);
            if (!pathNorm) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'Invalid path' }));
                return;
            }
            let sourceFile = this.resolveOnlineMarkdownFile(data.path);
            if (!sourceFile) {
                res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'Note not found' }));
                return;
            }
            let fname = String(data.fname || '').trim();
            if (!fname) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'fname required' }));
                return;
            }
            let nc = (this.app as any).plugins?.getPlugin?.('note-chain');
            if (!nc) {
                res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'note-chain plugin not available' }));
                return;
            }
            let textareaValue = typeof data.textareaValue === 'string' ? data.textareaValue : '';
            let source = typeof data.source === 'string' ? data.source : '';
            let params = data.params;

            let cmd = (this.app as any).commands?.findCommand?.(fname);
            if (cmd) {
                (this.app as any).commands.executeCommandById(fname);
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ ok: true }));
                return;
            }

            let taMethod = (nc.textarea as any)[fname];
            if (typeof taMethod === 'function') {
                let val = textareaValue;
                let mockArea: any = {};
                Object.defineProperty(mockArea, 'value', {
                    configurable: true,
                    enumerable: true,
                    get() {
                        return val;
                    },
                    set(v: string) {
                        val = String(v);
                    },
                });
                mockArea.style = {};
                mockArea.focus = () => {};
                mockArea.select = () => {};
                let mockEl: any = {};
                let mockCtx: any = { sourcePath: sourceFile.path };
                let ret =
                    params !== undefined && params !== null
                        ? taMethod.call(nc.textarea, mockArea, source, mockEl, mockCtx, params)
                        : taMethod.call(nc.textarea, mockArea, source, mockEl, mockCtx);
                if (ret && typeof (ret as any).then === 'function') {
                    await ret;
                }
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ ok: true, newValue: val }));
                return;
            }

            let ufunc = await nc.utils.get_str_func(this.app, fname);
            if (typeof ufunc === 'function') {
                let val = textareaValue;
                let mockArea: any = {};
                Object.defineProperty(mockArea, 'value', {
                    configurable: true,
                    enumerable: true,
                    get() {
                        return val;
                    },
                    set(v: string) {
                        val = String(v);
                    },
                });
                mockArea.style = {};
                mockArea.focus = () => {};
                mockArea.select = () => {};
                let mockEl: any = {};
                let mockCtx: any = { sourcePath: sourceFile.path };
                let ret =
                    params !== undefined && params !== null
                        ? ufunc(mockArea, source, mockEl, mockCtx, params)
                        : ufunc(mockArea, source, mockEl, mockCtx);
                if (ret && typeof (ret as any).then === 'function') {
                    await ret;
                }
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ ok: true, newValue: val }));
                return;
            }

            let tfile = nc.easyapi.file.get_tfile(fname);
            if (tfile) {
                let tplTags = nc.settings?.notechain?.tpl_tags_folder as any;
                let tagInTplFolder = (tag: string): boolean => {
                    if (!tplTags) {
                        return false;
                    }
                    if (typeof tplTags.contains === 'function') {
                        return tplTags.contains(tag);
                    }
                    if (typeof tplTags === 'string') {
                        let lines = tplTags
                            .trim()
                            .split(/\n/)
                            .map((s: string) => s.trim())
                            .filter(Boolean);
                        return lines.indexOf(tag) >= 0;
                    }
                    return false;
                };
                let tags = nc.easyapi.file
                    .get_tags(tfile)
                    .map((x: string) => x.slice(1))
                    .filter((x: string) => tagInTplFolder(x));
                if (tags.length > 0) {
                    let val = textareaValue;
                    let mockArea: any = {};
                    Object.defineProperty(mockArea, 'value', {
                        configurable: true,
                        enumerable: true,
                        get() {
                            return val;
                        },
                        set(v: string) {
                            val = String(v);
                        },
                    });
                    mockArea.style = {};
                    mockArea.focus = () => {};
                    mockArea.select = () => {};
                    await nc.easyapi.tpl.parse_templater(fname, true, {
                        area: mockArea,
                        source: source,
                        el: {},
                        ctx: { sourcePath: sourceFile.path },
                        params: params,
                    });
                    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ ok: true, newValue: val }));
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(
                    JSON.stringify({
                        ok: false,
                        notice: '该文件需在 Obsidian 内打开（无 templater 标签）',
                    }),
                );
                return;
            }

            res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'Unknown button target: ' + fname }));
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: error.message || 'textarea-exec failed' }));
        }
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

    /**
     * 将 Markdown 渲染为 HTML 并以 NDJSON 流推送：首帧尽快返回，Dataview 等异步更新时防抖刷新，最后 done:true。
     * 每行一个 JSON：{ html, done? , error? }
     */
    private async streamOnlineRenderNdjson(
        res: any,
        el: HTMLElement,
        idleMs: number,
        maxMs: number,
        sourcePath: string,
    ): Promise<void> {
        let lastSentRaw = '';
        const writeLine = (html: string, done: boolean) => {
            if (res.writableEnded) {
                return;
            }
            if (!done && html === lastSentRaw) {
                return;
            }
            lastSentRaw = html;
            let htmlOut = this.rewriteOnlinePreviewHtml(html, sourcePath);
            res.write(JSON.stringify({ html: htmlOut, done }) + '\n');
            if (typeof res.flush === 'function') {
                (res as any).flush();
            }
        };

        writeLine(el.innerHTML, false);

        await new Promise<void>((resolve) => {
            let settled = false;
            let lastMutation = Date.now();
            let idleTimer: ReturnType<typeof setTimeout> | null = null;
            let debouncePushTimer: ReturnType<typeof setTimeout> | null = null;

            const finish = () => {
                if (settled) {
                    return;
                }
                settled = true;
                if (idleTimer) {
                    clearTimeout(idleTimer);
                    idleTimer = null;
                }
                if (debouncePushTimer) {
                    clearTimeout(debouncePushTimer);
                    debouncePushTimer = null;
                }
                clearTimeout(maxTimer);
                observer.disconnect();
                writeLine(el.innerHTML, true);
                resolve();
            };

            const queuePush = () => {
                if (debouncePushTimer) {
                    clearTimeout(debouncePushTimer);
                }
                debouncePushTimer = setTimeout(() => {
                    debouncePushTimer = null;
                    if (!settled) {
                        writeLine(el.innerHTML, false);
                    }
                }, 55);
            };

            const schedule = () => {
                if (idleTimer) {
                    clearTimeout(idleTimer);
                }
                idleTimer = setTimeout(() => {
                    idleTimer = null;
                    if (Date.now() - lastMutation >= idleMs) {
                        finish();
                    } else {
                        schedule();
                    }
                }, idleMs);
            };

            const observer = new MutationObserver(() => {
                lastMutation = Date.now();
                queuePush();
                schedule();
            });
            // 不监听 attributes：类名/style 等抖动会让「静默」很难达成，普通笔记会白等很久
            observer.observe(el, {
                subtree: true,
                childList: true,
                characterData: true,
            });

            schedule();
            const maxTimer = setTimeout(finish, maxMs);
        });
    }

    /** 是否含 Dataview 等需长时间异步填充的块（避免正文里出现 “dataview” 字样误触发） */
    private needsExtendedOnlineRenderWait(markdown: string, el: HTMLElement): boolean {
        if (
            el.querySelector(
                '.block-language-dataview, .block-language-dataviewjs, pre[class*="language-dataview"]',
            )
        ) {
            return true;
        }
        let md = markdown || '';
        return (
            /(^|\r?\n)```[\t ]*dataviewjs\b/i.test(md) ||
            /(^|\r?\n)```[\t ]*dataview\b/i.test(md)
        );
    }

    /**
     * 使用 Obsidian MarkdownRenderer 将 Markdown 转为 HTML，供 /online 浏览器预览
     *（与库内预览一致：链接、callout、任务列表等由 Obsidian 解析）
     */
    private async handleOnlineRender(req: any, res: any) {
        let host: HTMLElement | null = null;
        let comp: Component | null = null;
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
            let pathNorm = this.normalizeOnlineVaultPath(data.path);
            if (!pathNorm) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'Invalid path' }));
                return;
            }
            let markdown = typeof data.markdown === 'string' ? data.markdown : '';
            let file = this.resolveOnlineMarkdownFile(data.path);
            let sourcePath = file ? file.path : pathNorm;
            let el = document.createElement('div');
            el.classList.add('markdown-rendered');
            comp = new Component();
            comp.load();
            host = document.createElement('div');
            host.style.cssText =
                'position:fixed;left:-99999px;top:0;width:920px;max-width:100vw;opacity:0;pointer-events:none;z-index:-1;overflow:hidden;';
            document.body.appendChild(host);
            host.appendChild(el);
            res.writeHead(200, {
                'Content-Type': 'application/x-ndjson; charset=utf-8',
                'Cache-Control': 'no-cache',
                'X-Accel-Buffering': 'no',
                'Access-Control-Allow-Origin': '*',
            });
            await MarkdownRenderer.render(this.app, markdown, el, sourcePath, comp);
            await new Promise<void>((r) =>
                requestAnimationFrame(() => requestAnimationFrame(() => r())),
            );
            let extended = this.needsExtendedOnlineRenderWait(markdown, el);
            let idleMs = extended ? 280 : 42;
            let maxMs = extended ? 12000 : 280;
            await this.streamOnlineRenderNdjson(res, el, idleMs, maxMs, sourcePath);
        } catch (error: any) {
            if (res.headersSent) {
                try {
                    res.write(
                        JSON.stringify({
                            error: error.message || 'render failed',
                            done: true,
                        }) + '\n',
                    );
                } catch {
                    // ignore
                }
            } else {
                res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: error.message || 'render failed' }));
            }
        } finally {
            if (host && host.parentNode) {
                host.parentNode.removeChild(host);
            }
            if (comp) {
                comp.unload();
            }
            if (!res.writableEnded) {
                res.end();
            }
        }
    }

    /** 解析 [[wikilink]] / 内部链接，供浏览器内跳转 */
    private async handleOnlineResolveLink(req: any, res: any, parsedUrl: any) {
        try {
            let fromRaw = parsedUrl.query && (parsedUrl.query.from as string | undefined);
            let toRaw = parsedUrl.query && (parsedUrl.query.to as string | undefined);
            let from = this.normalizeOnlineVaultPath(fromRaw);
            let to = (toRaw || '').trim();
            if (!from || !to) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'from and to are required' }));
                return;
            }
            let dest = this.app.metadataCache.getFirstLinkpathDest(to, from);
            if (!dest || !(dest instanceof TFile) || dest.extension !== 'md') {
                res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'Linked note not found' }));
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ path: dest.path, basename: dest.basename }));
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: error.message || 'resolve failed' }));
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