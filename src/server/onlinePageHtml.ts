export const ONLINE_PAGE_HTML = `<!DOCTYPE html>
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
        .msg { font-size: 0.9rem; margin-top: 0.5rem; white-space: pre-wrap; word-break: break-word; max-height: 45vh; overflow: auto; }
        .msg.err { color: #c22; }
        .msg.ok { color: #2a7; }
        .hidden { display: none !important; }
    </style>
</head>
<body>
    <h1>Obsidian Online</h1>
    <div class="row">
        <input type="search" id="q" placeholder="按路径或标题搜索…" autocomplete="off">
        <button type="button" class="primary" id="btnSearch">搜索</button>
        <button type="button" class="secondary hidden" id="btnHome" title="返回 URL 指定的入口笔记">🏠</button>
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
    var btnHome = document.getElementById('btnHome');
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
    /** 每次打开/重渲染递增，防止慢速 render 流在切换笔记后仍写回 viewer */
    var loadGeneration = 0;
    /** URL ?filename= / ?path= 解析后的库内路径，供 🏠 返回 */
    var homeEntryPath = '';
    /** 与 resolve-note 请求一致的名字（解码后），首次解析失败时点击 🏠 可重试 */
    var homeEntryQuery = '';

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

    /** 预览区内正在输入时，避免整段 innerHTML 替换抢走焦点（手机键盘收起） */
    function isEditableFocusInsideViewer() {
        var ae = document.activeElement;
        if (!ae || !viewer.contains(ae)) return false;
        if (ae.isContentEditable) return true;
        var t = ae.tagName;
        if (t === 'TEXTAREA') return true;
        if (t === 'INPUT') {
            var typ = (ae.getAttribute('type') || '').toLowerCase();
            if (['checkbox', 'radio', 'button', 'submit', 'file', 'hidden', 'range', 'color'].indexOf(typ) >= 0) {
                return false;
            }
            return true;
        }
        return false;
    }

    function captureViewerTextareaState() {
        var ae = document.activeElement;
        var list = viewer.querySelectorAll('textarea');
        var vals = Array.prototype.map.call(list, function (t) { return t.value; });
        var focusIdx = -1;
        if (ae && ae.tagName === 'TEXTAREA' && viewer.contains(ae)) {
            for (var i = 0; i < list.length; i++) {
                if (list[i] === ae) {
                    focusIdx = i;
                    break;
                }
            }
        }
        return { vals: vals, focusIdx: focusIdx };
    }

    function applyViewerMarkdownHtml(html, frameIsDone) {
        if (!frameIsDone && isEditableFocusInsideViewer()) {
            return;
        }
        var st = isEditableFocusInsideViewer() ? captureViewerTextareaState() : null;
        viewer.innerHTML = '<div class="markdown-rendered">' + html + '</div>';
        if (!st) return;
        var tas = viewer.querySelectorAll('textarea');
        var k = Math.min(tas.length, st.vals.length);
        for (var j = 0; j < k; j++) {
            tas[j].value = st.vals[j];
        }
        if (st.focusIdx >= 0 && st.focusIdx < tas.length) {
            var ta = tas[st.focusIdx];
            requestAnimationFrame(function () {
                ta.focus();
                try {
                    var len = ta.value.length;
                    ta.setSelectionRange(len, len);
                } catch (e2) {}
            });
        }
    }

    /** 锁屏、切后台等导致 fetch/流中断时的常见错误 */
    function isTransientNetworkError(e) {
        if (!e) return false;
        var nm = e.name || '';
        if (nm === 'TypeError' || nm === 'NetworkError' || nm === 'AbortError') return true;
        var m = String(e.message || e);
        return /network|fetch|fail|aborted|closed|reset|timeout|offline|interrupted|lost|断开|load failed/i.test(m);
    }

    async function renderPreviewOnce(path, markdown, gen) {
        var res = await fetch('/online/api/render', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/x-ndjson' },
            body: JSON.stringify({ path: path, markdown: markdown })
        });
        if (gen !== loadGeneration) {
            try {
                if (res.body && res.body.cancel) res.body.cancel();
            } catch (_) {}
            return;
        }
        if (!res.ok) {
            var errText = await res.text();
            var errJson = {};
            try { errJson = JSON.parse(errText); } catch (_) {}
            throw new Error(errJson.error || res.statusText);
        }
        var ct = (res.headers.get('content-type') || '').toLowerCase();
        if (ct.indexOf('ndjson') < 0 || !res.body || !res.body.getReader) {
            var data = await res.json().catch(function () { return {}; });
            if (gen !== loadGeneration) return;
            applyViewerMarkdownHtml(data.html || '', true);
            return;
        }
        var reader = res.body.getReader();
        var dec = new TextDecoder();
        var buf = '';
        while (true) {
            var rd = await reader.read();
            if (gen !== loadGeneration) {
                try { reader.cancel(); } catch (_) {}
                return;
            }
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
                if (gen !== loadGeneration) {
                    try { reader.cancel(); } catch (_) {}
                    return;
                }
                applyViewerMarkdownHtml(frame.html || '', !!frame.done);
                if (frame.done) return;
            }
        }
    }

    async function renderPreview(path, markdown, gen) {
        var maxAttempts = 3;
        var lastErr;
        for (var a = 0; a < maxAttempts; a++) {
            if (gen !== loadGeneration) return;
            try {
                if (a > 0) {
                    await new Promise(function (r) { setTimeout(r, 400 + a * 350); });
                    if (gen !== loadGeneration) return;
                }
                await renderPreviewOnce(path, markdown, gen);
                return;
            } catch (e) {
                lastErr = e;
                if (gen !== loadGeneration) return;
                if (a + 1 >= maxAttempts || !isTransientNetworkError(e)) throw e;
            }
        }
        throw lastErr;
    }

    async function loadNote(path) {
        loadGeneration++;
        var gen = loadGeneration;
        setMsg('');
        currentPath = path;
        currentLabel.textContent = path;
        setMode('view');
        viewer.innerHTML = '<p class="online-loading">加载…</p>';
        viewer.classList.remove('hidden');
        try {
            var res = await fetch('/online/api/note?path=' + encodeURIComponent(path));
            var data = await res.json();
            if (gen !== loadGeneration) return;
            if (!res.ok) throw new Error(data.error || res.statusText);
            editor.value = data.content || '';
        } catch (e) {
            if (gen !== loadGeneration) return;
            viewer.innerHTML = '';
            setMsg('读取失败：' + e.message, 'err');
            currentPath = '';
            currentLabel.textContent = '未选择笔记';
            setMode('none');
            return;
        }
        try {
            await renderPreview(path, editor.value, gen);
        } catch (e) {
            if (gen !== loadGeneration) return;
            setMsg('预览中断，正在重试…', '');
            viewer.innerHTML = '<p class="online-loading">恢复预览…</p>';
            await new Promise(function (r) { setTimeout(r, 500); });
            if (gen !== loadGeneration) return;
            loadGeneration++;
            var g2 = loadGeneration;
            try {
                await renderPreview(path, editor.value, g2);
                setMsg('', '');
            } catch (e2) {
                if (g2 !== loadGeneration) return;
                setMsg('预览失败：' + e2.message + '（亮屏后将自动再试）', 'err');
                viewer.innerHTML = '<p class="online-loading">预览未加载</p>';
            }
        }
    }

    btnSearch.onclick = search;
    q.onkeydown = function (e) { if (e.key === 'Enter') search(); };

    btnView.onclick = async function () {
        if (!currentPath) return;
        loadGeneration++;
        var gen = loadGeneration;
        setMode('view');
        viewer.innerHTML = '<p class="online-loading">渲染…</p>';
        try {
            await renderPreview(currentPath, editor.value, gen);
        } catch (e) {
            if (gen !== loadGeneration) return;
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
            loadGeneration++;
            var gen = loadGeneration;
            try {
                await renderPreview(currentPath, editor.value, gen);
            } catch (re) {
                if (gen !== loadGeneration) return;
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
            if (container) {
                e.preventDefault();
                e.stopPropagation();
                var area = container.querySelector('textarea.code_block_textarea');
                if (!area) {
                    area = container.querySelector('textarea:not(.nc-ta-block-meta)');
                }
                var textareaVal = area ? area.value : '';
                var fname = taBtn.getAttribute('data-nc-online-fname') || '';
                var ps = taBtn.getAttribute('data-nc-online-params');
                var params;
                if (ps) {
                    try { params = JSON.parse(ps); } catch (_) { params = undefined; }
                }
                var meta = container.querySelector('textarea.nc-ta-block-meta');
                var src = meta ? meta.value : '';
                if (fname === 'clear_area') {
                    if (area) {
                        area.value = '';
                        setMsg('', '');
                    }
                    return;
                }
                if (fname === 'copy_area') {
                    if (area) {
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
                    }
                    return;
                }
                if (fname === 'log_area') {
                    console.log('[Online textarea]', textareaVal);
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
                        textareaValue: textareaVal,
                        source: src,
                        params: params,
                        from_online: true,
                    })
                })
                    .then(function (res) { return res.json().then(function (d) { return { res: res, d: d }; }); })
                    .then(function (x) {
                        if (!x.res.ok) {
                            setMsg(x.d.error || '请求失败', 'err');
                            return;
                        }
                        var d = x.d;
                        if (area && d.newValue !== undefined && d.newValue !== null) {
                            area.value = String(d.newValue);
                        }
                        if (d.notice) {
                            setMsg(d.notice, 'ok');
                        } else if (Object.prototype.hasOwnProperty.call(d, 'tplResult') && Array.isArray(d.tplResult)) {
                            var lines = d.tplResult.map(function (item) {
                                if (item === null || item === undefined) return '';
                                if (typeof item === 'string') return item;
                                try { return JSON.stringify(item); } catch (e) { return String(item); }
                            });
                            var nonEmpty = lines.filter(function (s) { return String(s).length > 0; });
                            if (nonEmpty.length) {
                                setMsg(nonEmpty.join('\\n---\\n'), 'ok');
                            } else {
                                setMsg('已执行（模板无文本输出）', 'ok');
                            }
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

    function goHomeNote() {
        if (homeEntryPath) {
            loadNote(homeEntryPath);
            return;
        }
        if (!homeEntryQuery) {
            return;
        }
        setMsg('正在打开入口笔记…', '');
        fetch('/online/api/resolve-note?name=' + encodeURIComponent(homeEntryQuery))
            .then(function (res) {
                return res.json().then(function (d) {
                    return { res: res, d: d };
                });
            })
            .then(function (x) {
                if (!x.res.ok) {
                    setMsg((x.d && x.d.error) || '找不到入口笔记', 'err');
                    return;
                }
                if (x.d.path) {
                    homeEntryPath = x.d.path;
                    loadNote(x.d.path);
                }
            })
            .catch(function (e3) {
                setMsg(e3.message || '打开失败', 'err');
            });
    }

    if (btnHome) {
        btnHome.onclick = function () {
            goHomeNote();
        };
    }

    var bootParams = new URLSearchParams(window.location.search);
    var bootPath = bootParams.get('filename') || bootParams.get('path');
    if (bootPath) {
        bootPath = bootPath.trim();
        if (bootPath) {
            try {
                bootPath = decodeURIComponent(bootPath);
            } catch (e2) {
                // 已是解码后的路径
            }
            homeEntryQuery = bootPath;
            if (btnHome) {
                btnHome.classList.remove('hidden');
            }
            fetch('/online/api/resolve-note?name=' + encodeURIComponent(bootPath))
                .then(function (res) {
                    return res.json().then(function (d) {
                        return { res: res, d: d };
                    });
                })
                .then(function (x) {
                    if (!x.res.ok) {
                        setMsg((x.d && x.d.error) || '找不到笔记', 'err');
                        return;
                    }
                    if (x.d.path) {
                        homeEntryPath = x.d.path;
                        loadNote(x.d.path);
                    }
                })
                .catch(function (e3) {
                    setMsg(e3.message || '打开失败', 'err');
                });
        }
    }
    var bootQueryRaw = bootParams.get('query');
    if (bootQueryRaw != null && String(bootQueryRaw).trim()) {
        var bootQuery = String(bootQueryRaw).trim();
        try {
            bootQuery = decodeURIComponent(bootQuery);
        } catch (e4) {
            // 已是解码后的字符串
        }
        if (q) {
            q.value = bootQuery;
        }
        search();
    }

    var resumePreviewTimer = null;
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState !== 'visible') return;
        if (!currentPath || mode !== 'view') return;
        clearTimeout(resumePreviewTimer);
        resumePreviewTimer = setTimeout(function () {
            if (!currentPath || mode !== 'view') return;
            var hasRendered = !!viewer.querySelector('.markdown-rendered');
            var loadEl = viewer.querySelector('.online-loading');
            if (hasRendered && !loadEl) return;
            loadGeneration++;
            var g = loadGeneration;
            var p = currentPath;
            var md = editor.value;
            viewer.innerHTML = '<p class="online-loading">恢复预览…</p>';
            setMsg('', '');
            renderPreview(p, md, g).catch(function (err) {
                if (g !== loadGeneration) return;
                setMsg('恢复失败：' + err.message, 'err');
            });
        }, 400);
    });
})();
    </script>
</body>
</html>`;
