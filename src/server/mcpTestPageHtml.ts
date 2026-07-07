export const MCP_TEST_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MCP call_tool 测试</title>
    <style>
        body { font-family: system-ui, sans-serif; max-width: 640px; margin: 2rem auto; padding: 0 1rem; }
        input, button { padding: 0.5rem 0.75rem; margin: 0.25rem 0; }
        input[type="url"] { width: 100%; box-sizing: border-box; }
        textarea#toolArgs { width: 100%; box-sizing: border-box; min-height: 7rem; padding: 0.5rem 0.65rem; font-family: ui-monospace, Consolas, monospace; font-size: 0.9rem; line-height: 1.4; border-radius: 4px; border: 1px solid #ccc; resize: vertical; }
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
            <input type="url" id="baseUrl" value="__BASE_URL__" placeholder="https://127.0.0.1:3000">
        </label>
    </p>
    <p>
        <label>工具名：<br>
            <input type="text" id="toolName" value="get_current_note" placeholder="get_current_note">
        </label>
    </p>
    <p>
        <label>参数：<br>
            <textarea id="toolArgs" spellcheck="false" placeholder="query: test">query: test</textarea>
        </label>
    </p>
    <p>
        <button id="btn">调用 call_tool</button>
    </p>
    <p id="out"></p>
    <script src="https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.min.js" crossorigin="anonymous"></script>
    <script>
        function escapeHtml(s) {
            return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }
        /** 将 MCP 常见的 { type: text, text: "<JSON 字符串>" } 递归展开为对象，便于 YAML 分层展示 */
        function expandMcpTextJsonForDisplay(v) {
            if (typeof v === 'string') {
                var ts = v.trim();
                if ((ts.charAt(0) === '{' && ts.charAt(ts.length - 1) === '}') ||
                    (ts.charAt(0) === '[' && ts.charAt(ts.length - 1) === ']')) {
                    try { return expandMcpTextJsonForDisplay(JSON.parse(ts)); } catch (e0) {}
                }
                return v;
            }
            if (v === null || typeof v !== 'object') return v;
            if (Array.isArray(v)) return v.map(expandMcpTextJsonForDisplay);
            var keys = Object.keys(v);
            var out = {};
            for (var i = 0; i < keys.length; i++) {
                var k = keys[i];
                out[k] = expandMcpTextJsonForDisplay(v[k]);
            }
            if (out.type === 'text' && typeof out.text === 'string') {
                var s = out.text.trim();
                if ((s.charAt(0) === '{' && s.charAt(s.length - 1) === '}') ||
                    (s.charAt(0) === '[' && s.charAt(s.length - 1) === ']')) {
                    try {
                        out.text = expandMcpTextJsonForDisplay(JSON.parse(s));
                    } catch (e1) {}
                }
            }
            return out;
        }
        function formatResultAsYaml(data) {
            if (typeof jsyaml === 'undefined') {
                return typeof data === 'object' && data !== null ? JSON.stringify(data, null, 2) : String(data);
            }
            try {
                var toDump = expandMcpTextJsonForDisplay(data);
                var y = jsyaml.dump(toDump, { lineWidth: 120, noRefs: true, skipInvalid: true });
                return y.replace(/\\n$/, '');
            } catch (e) {
                return typeof data === 'object' && data !== null ? JSON.stringify(data, null, 2) : String(data);
            }
        }
        document.getElementById('btn').onclick = async function () {
            var base = document.getElementById('baseUrl').value.replace(/\\/$/, '');
            var name = document.getElementById('toolName').value.trim();
            var argsStr = document.getElementById('toolArgs').value.trim();
            var out = document.getElementById('out');
            var args = {};
            if (argsStr) {
                if (typeof jsyaml === 'undefined') {
                    out.innerHTML = '<pre class="error">未加载 js-yaml（请检查网络能否访问 CDN），无法解析 YAML。</pre>';
                    return;
                }
                var parsed;
                try { parsed = jsyaml.load(argsStr); } catch (e) {
                    out.innerHTML = '<pre class="error">参数不是合法 YAML：' + e.message + '</pre>';
                    return;
                }
                if (parsed == null) args = {};
                else if (typeof parsed !== 'object' || Array.isArray(parsed)) {
                    out.innerHTML = '<pre class="error">YAML 顶层必须是对象（键值对），不能是数组或标量。</pre>';
                    return;
                }
                else args = parsed;
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
                    '<pre>' + escapeHtml(formatResultAsYaml(data)) + '</pre>';
            } catch (e) {
                out.innerHTML = '<pre class="error">请求失败：' + e.message + '</pre>';
            }
        };
    </script>
</body>
</html>`;
