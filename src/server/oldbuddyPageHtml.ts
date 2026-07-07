/** 由 scripts/build-oldbuddy-page.mjs 生成，请勿手改 */
export const OLDBUDDY_PAGE_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>OldBuddy 老友聊天</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <style>
:root {
    --wechat-bg: #ededed;
    --wechat-green: #95ec69;
    --wechat-white: #ffffff;
    --wechat-text: #111;
    --wechat-meta: #888;
    --input-bar-height: 80px;
}

* {
    box-sizing: border-box;
}

html,
body {
    margin: 0;
    padding: 0;
    height: 100%;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    background: var(--wechat-bg);
    color: var(--wechat-text);
    overflow: hidden;
}

#chat-wrapper {
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100dvh;
    width: 100%;
    max-width: none;
    margin: 0;
    background: var(--wechat-bg);
}

#status-bar {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    background: #f7f7f7;
    border-bottom: 1px solid #dcdcdc;
    font-size: 13px;
    position: relative;
    z-index: 1000;
}

#status-settings-wrap {
    position: relative;
}

#status-settings-toggle {
    border: 1px solid #ccc;
    background: #fff;
    border-radius: 4px;
    padding: 2px 8px;
    font-size: 12px;
    cursor: pointer;
}

#status-settings-menu {
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 4px;
    background: #fff;
    border: 1px solid #ccc;
    border-radius: 6px;
    padding: 8px 10px;
    min-width: 160px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
    z-index: 1002;
}

#status-settings-menu.open {
    display: block;
}

.status-setting-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    margin: 4px 0;
    cursor: pointer;
}

#status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: gray;
}

#status-text {
    color: var(--wechat-meta);
}

#current-target-chip {
    background: #e8f5e9;
    color: #2e7d32;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 12px;
}

#chat-target {
    margin-left: auto;
    max-width: 160px;
    font-size: 12px;
    padding: 4px 6px;
    border-radius: 4px;
    border: 1px solid #ccc;
    background: #fff;
}

#messages {
    flex: 1 1 auto;
    overflow-y: auto;
    padding: 12px 10px calc(12px + var(--input-bar-height));
    -webkit-overflow-scrolling: touch;
    display: flex;
    flex-direction: column;
}

.message {
    display: flex;
    flex-direction: column;
    margin-bottom: 10px;
    max-width: min(92%, 760px);
    width: fit-content;
}

.message-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    max-width: 100%;
}

.message-row-user {
    flex-direction: row;
}

.message-avatar {
    width: 40px;
    height: 40px;
    min-width: 40px;
    border-radius: 4px;
    flex-shrink: 0;
    overflow: hidden;
    background: #d8d8d8;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    color: #555;
    user-select: none;
}

.message-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
}

.message-body {
    display: flex;
    flex-direction: column;
    min-width: 0;
    max-width: calc(100vw - 80px);
}

.message-nickname {
    font-size: 12px;
    color: #888;
    margin-bottom: 4px;
    line-height: 1.2;
    padding: 0 2px;
}

.message.user .message-nickname {
    text-align: right;
}

.message.user {
    align-self: flex-end;
    align-items: flex-end;
}

.message.buddy,
.message.assistant,
.message.system,
.message.debug {
    align-self: flex-start;
    align-items: flex-start;
}

.message-time {
    font-size: 11px;
    color: var(--wechat-meta);
    margin-bottom: 4px;
    text-align: center;
    align-self: stretch;
    max-width: 100%;
}

.message.user .message-time {
    text-align: right;
}

.message-target {
    font-size: 11px;
    color: #666;
    margin-bottom: 4px;
}

.message-content {
    padding: 10px 12px;
    border-radius: 8px;
    background: var(--wechat-white);
    word-break: break-word;
    line-height: 1.45;
    box-shadow: 0 1px 1px rgba(0, 0, 0, 0.06);
}

.message.user .message-content {
    background: var(--wechat-green);
}

.message-content.markdown-card {
    min-width: min(92vw, 520px);
    max-width: min(92vw, 680px);
}

.message-content.markdown p {
    margin: 0.35em 0;
}

.message-content.markdown pre {
    overflow: auto;
    background: #f4f4f4;
    padding: 8px;
    border-radius: 6px;
}

.message-content.markdown code {
    background: #f0f0f0;
    padding: 1px 4px;
    border-radius: 3px;
}

.message-image {
    max-width: min(72vw, 320px);
    border-radius: 6px;
    display: block;
    cursor: zoom-in;
}

.message-audio {
    width: min(72vw, 280px);
}

.message-video,
.markdown .md-video {
    max-width: min(72vw, 320px);
    width: 100%;
    border-radius: 6px;
    display: block;
    background: #000;
}

.message-extra-text {
    margin-top: 8px;
    font-size: 14px;
}

#input-bar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    max-width: none;
    margin: 0;
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 8px 10px calc(8px + env(safe-area-inset-bottom));
    background: #f7f7f7;
    border-top: 1px solid #dcdcdc;
    z-index: 1001;
}

#left-buttons {
    display: flex;
    gap: 4px;
}

#left-buttons button,
#send-text {
    border: none;
    background: transparent;
    font-size: 22px;
    cursor: pointer;
    padding: 6px;
    line-height: 1;
}

#send-text {
    font-size: 14px;
    background: #07c160;
    color: #fff;
    border-radius: 6px;
    padding: 8px 14px;
    white-space: nowrap;
}

#send-text:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

#text-input {
    flex: 1;
    min-height: 44px;
    max-height: 140px;
    resize: none;
    border: 1px solid #ccc;
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 16px;
    line-height: 1.35;
    font-family: inherit;
}

#target-toast {
    position: fixed;
    left: 50%;
    bottom: calc(var(--input-bar-height) + 24px);
    transform: translateX(-50%) translateY(8px);
    background: rgba(0, 0, 0, 0.72);
    color: #fff;
    padding: 8px 14px;
    border-radius: 8px;
    font-size: 13px;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s, transform 0.2s;
    z-index: 2000;
}

#target-toast.show {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
}

#reference-picker {
    position: fixed;
    z-index: 2001;
    max-height: min(40vh, 280px);
    overflow-y: auto;
    background: #fff;
    border: 1px solid #d8d8d8;
    border-radius: 8px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.14);
    padding: 4px 0;
    -webkit-overflow-scrolling: touch;
}

.reference-picker-item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    width: 100%;
    border: none;
    background: transparent;
    padding: 10px 14px;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
}

.reference-picker-item:hover,
.reference-picker-item.active {
    background: #f0f0f0;
}

.reference-picker-label {
    font-size: 15px;
    color: #111;
}

.reference-picker-sub {
    font-size: 12px;
    color: #888;
}

#quick-cmd-menu button:hover {
    background: #f5f5f5;
}

@media (max-width: 600px) {
    #chat-target {
        max-width: 120px;
    }

    .message {
        max-width: 92%;
    }
}

/* 文件菜单 */
        #file-menu {
            position: fixed;
            bottom: calc(8px + var(--input-bar-height, 80px));
            left: 10px;
            background: #fff;
            border: 1px solid #ccc;
            border-radius: 6px;
            display: none;
            flex-direction: column;
            z-index: 1001;
        }

        #file-menu button {
            padding: 10px;
            border: none;
            background: #fff;
            text-align: left;
            cursor: pointer;
        }

        #file-menu button:hover {
            background: #eee;
        }
    </style>
</head>
<body>
<div id="chat-wrapper">
        <div id="status-bar">
            <div id="status-settings-wrap">
                <button id="status-settings-toggle" title="打开状态设置">状态设置</button>
                <div id="status-settings-menu" aria-label="状态设置">
                    <label class="status-setting-item">
                        <input id="target-filter-toggle" type="checkbox">
                        <span>仅当前对象</span>
                    </label>
                    <label class="status-setting-item">
                        <input id="time-filter-toggle" type="checkbox">
                        <span>隐藏旧记录</span>
                    </label>
                </div>
            </div>
            <div id="status-dot"></div>
            <span id="status-text">离线</span>
            <span id="current-target-chip">本地</span>
            <select id="chat-target" title="聊天对象">
                <option value="local">local</option>
            </select>
        </div>
        <div id="messages" role="log" aria-live="polite"></div>
    </div>

    <!-- 移出 #chat-wrapper 并 fixed，避免移动端 100vh/dvh + overflow:hidden 把整栏裁到屏外 -->
    <div id="input-bar">
        <div id="left-buttons">
            <button id="send-file">📁</button>
            <button id="send-audio">🎤</button>
        </div>
        <textarea id="text-input" placeholder="输入消息，可粘贴截图 (Ctrl+V)..." rows="1"></textarea>
        <button id="send-text">发送</button>
    </div>

    <div id="file-menu">
        <button id="camera-btn">拍照</button>
        <button id="gallery-btn">选择图片</button>
        <button id="anyfile-btn">上传文件</button>
        <button id="video-btn" type="button">录像</button>
        <button id="location-btn" type="button" title="读取定位并发送经纬度">发送位置</button>
    </div>

    <input type="file" id="camera-input" accept="image/*" capture="environment" style="display:none">
    <input type="file" id="gallery-input" accept="image/*" style="display:none">
    <input type="file" id="anyfile-input" style="display:none">
    <input type="file" id="video-input" accept="video/*,.mp4,.mov,.m4v,.webm,.mkv,.3gp" capture="environment" style="display:none">

    <script>

        document.addEventListener("DOMContentLoaded", async () => {

            const inputBarEl = document.getElementById('input-bar');
            function syncInputBarHeight() {
                if (!inputBarEl) return;
                document.documentElement.style.setProperty(
                    '--input-bar-height',
                    inputBarEl.getBoundingClientRect().height + 'px'
                );
            }
            syncInputBarHeight();
            if (inputBarEl && typeof ResizeObserver !== 'undefined') {
                new ResizeObserver(syncInputBarHeight).observe(inputBarEl);
            }
            window.addEventListener('resize', syncInputBarHeight);
            if (window.visualViewport) {
                window.visualViewport.addEventListener('resize', syncInputBarHeight);
                window.visualViewport.addEventListener('scroll', syncInputBarHeight);
            }

            const messagesContainer = document.getElementById('messages');
            let currentSkip = 0, isLoading = false;

            // ------------- WebSocket 连接 -------------
            connectWS();

            await createQuickCommandUI();

            // 绑定点击事件（发送按钮）
            document.getElementById('send-text').onclick = async () => {
                await sendTextMessage();
            };

            // 桌面：Enter 发送，Shift+Enter 换行。手机无 Shift+Enter：Enter 直接换行，点「发送」发消息。
            const textInput = document.getElementById('text-input');
            const mqFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
            function syncEnterKeyHint() {
                textInput.setAttribute('enterkeyhint', mqFinePointer.matches ? 'send' : 'enter');
            }
            syncEnterKeyHint();
            if (typeof mqFinePointer.addEventListener === 'function') {
                mqFinePointer.addEventListener('change', syncEnterKeyHint);
            } else if (typeof mqFinePointer.addListener === 'function') {
                mqFinePointer.addListener(syncEnterKeyHint);
            }

            textInput.addEventListener('keydown', async (e) => {
                if (typeof isReferencePickerOpen === 'function' && isReferencePickerOpen()) return;
                if (e.key !== 'Enter' || e.shiftKey) return;
                if (!mqFinePointer.matches) return; /* 触摸为主：不拦截，由系统插入换行 */
                e.preventDefault();
                const sendBtn = document.getElementById('send-text');
                if (sendBtn.disabled) return;
                await sendTextMessage();
            });

            // textarea 自适应高度（最多 6 行左右）；移动端 WebKit 偶发 scrollHeight=0，须保底高度
            textInput.addEventListener('input', () => autosizeTextInput(textInput));
            autosizeTextInput(textInput);
            syncInputBarHeight();

            // ---------- 文件菜单 ----------
            const fileBtn = document.getElementById('send-file');
            const fileMenu = document.getElementById('file-menu');
            const closeFileMenu = () => { fileMenu.style.display = 'none'; };
            fileBtn.onclick = () => { fileMenu.style.display = fileMenu.style.display === 'flex' ? 'none' : 'flex'; }
            document.getElementById('camera-btn').onclick = () => { closeFileMenu(); document.getElementById('camera-input').click(); };
            document.getElementById('gallery-btn').onclick = () => { closeFileMenu(); document.getElementById('gallery-input').click(); };
            document.getElementById('anyfile-btn').onclick = () => { closeFileMenu(); document.getElementById('anyfile-input').click(); };
            document.getElementById('video-btn').onclick = () => { closeFileMenu(); document.getElementById('video-input').click(); };
            document.getElementById('location-btn').onclick = async () => {
                closeFileMenu();
                if (typeof sendLocationMessage === 'function') {
                    await sendLocationMessage();
                }
            };

            initUploadHandlers();
            initReferencePicker();
            if (typeof loadOldBuddyAvatars === 'function') {
                await loadOldBuddyAvatars(getCurrentChatTarget());
            }

            // ---------- 首次加载最近消息 ----------
            await loadMessages(10); // 首次加载最近 10 条
            // 首次加载后滚到底部（显示最新消息）
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            // 启用上拉加载
            setupScrollLoader(50);
        });

    </script>
<script>
let ws;
function connectWS() {
    ws = new WebSocket((location.protocol === "https:" ? "wss" : "ws") + "://" + location.host + "/oldbuddy/ws");

    ws.onopen = () => {
        document.getElementById('status-dot').style.backgroundColor = 'green';
        document.getElementById('status-text').textContent = '在线';
    };

    ws.onclose = () => {
        document.getElementById('status-dot').style.backgroundColor = 'gray';
        document.getElementById('status-text').textContent = '离线';
        // 尝试重连
        setTimeout(connectWS, 3000);
    };

    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            appendMessage(msg); // 使用新增的去重机制渲染消息
        } catch (e) { console.error("WebSocket parse error:", e); }
    };

    ws.onerror = (e) => {
        console.warn("WebSocket error", e);
    };
}

// static/js/markdown.js
// 聊天气泡用 Markdown 子集渲染（先转义再解析，降低 XSS 风险）
// 支持：标题 # / ## / ###、引用 >、分隔线 ---、粗斜体、行内代码、围栏代码块、链接、列表、删除线 ~~

(function () {
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  const VIDEO_URL_RE = /\\.(mp4|mov|m4v|mkv|3gp|webm)(\\?|#|$)/i;

  function isVideoUrl(url) {
    return VIDEO_URL_RE.test(String(url || ""));
  }

  function videoTag(url) {
    const safe = escapeHtml(url);
    return \`<video class="md-video" controls playsinline preload="metadata" src="\${safe}"></video>\`;
  }

  function renderInline(s) {
    const linkPlaceholders = [];
    const codePlaceholders = [];

    // Video: ![video](url) or [video](url)
    s = s.replace(/!\\[video\\]\\(([^\\s)]+)\\)/gi, (m, url) => videoTag(url));
    s = s.replace(/\\[video\\]\\(([^\\s)]+)\\)/gi, (m, url) => videoTag(url));

    // Links: [text](url) — 视频 URL 渲染为播放器
    s = s.replace(/\\[([^\\]]+)\\]\\((https?:\\/\\/[^\\s)]+)\\)/g, (m, text, url) => {
      if (isVideoUrl(url)) return videoTag(url);
      const key = \`@@MDLINKPLACEHOLDER\${linkPlaceholders.length}@@\`;
      linkPlaceholders.push(
        \`<a href="\${url}" target="_blank" rel="noopener noreferrer">\${text}</a>\`
      );
      return key;
    });
    // 相对路径 /oldbuddy/uploads/…
    s = s.replace(/\\[([^\\]]+)\\]\\((\\/oldbuddy\\/[^\\s)]+)\\)/g, (m, text, url) => {
      if (isVideoUrl(url)) return videoTag(url);
      const key = \`@@MDLINKPLACEHOLDER\${linkPlaceholders.length}@@\`;
      linkPlaceholders.push(
        \`<a href="\${url}" target="_blank" rel="noopener noreferrer">\${text}</a>\`
      );
      return key;
    });
    // Autolink: https://... — 视频直链嵌入播放器
    s = s.replace(/(https?:\\/\\/[^\\s<]+)/g, (m, url) => {
      if (isVideoUrl(url)) return videoTag(url);
      return \`<a href="\${url}" target="_blank" rel="noopener noreferrer">\${url}</a>\`;
    });

    // Inline code: \`code\` (placeholder so bold/italic passes skip it)
    s = s.replace(/\`([^\`\\n]+)\`/g, (m, code) => {
      const key = \`@@MDCODEPLACEHOLDER\${codePlaceholders.length}@@\`;
      codePlaceholders.push(\`<code>\${code}</code>\`);
      return key;
    });

    // Strikethrough: ~~text~~
    s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");

    // Bold: **text** or __text__
    s = s.replace(/\\*\\*([^\\n*][\\s\\S]*?[^\\n*])\\*\\*/g, "<strong>$1</strong>");
    s = s.replace(/__([^\\n_][\\s\\S]*?[^\\n_])__/g, "<strong>$1</strong>");

    // Italic: *text* or _text_ (skip _bsf_-like ASCII identifiers)
    s = s.replace(/(^|[^\\*])\\*([^\\n*]+)\\*(?!\\*)/g, "$1<em>$2</em>");
    s = s.replace(/(^|[^_\\w])_([^\\n_]+)_(?![_\\w])/g, (m, prefix, inner) => {
      if (/^[A-Za-z0-9_]+$/.test(inner)) return m;
      return \`\${prefix}<em>\${inner}</em>\`;
    });

    codePlaceholders.forEach((html, idx) => {
      s = s.replaceAll(\`@@MDCODEPLACEHOLDER\${idx}@@\`, html);
    });

    // Restore markdown link placeholders (avoid autolink touching href attributes)
    linkPlaceholders.forEach((html, idx) => {
      s = s.replaceAll(\`@@MDLINKPLACEHOLDER\${idx}@@\`, html);
    });

    return s;
  }

  function renderMarkdown(md) {
    const raw = md == null ? "" : String(md);
    const src = raw.replace(/\\r\\n/g, "\\n");

    const blocks = [];
    const withPlaceholders = src.replace(/\`\`\`([a-zA-Z0-9_-]+)?\\n([\\s\\S]*?)\`\`\`/g, (m, lang, code) => {
      const safeCode = escapeHtml(code).replace(/\\n$/, "");
      const safeLang = lang ? String(lang) : "";
      const html = \`<pre><code\${safeLang ? \` class="lang-\${escapeHtml(safeLang)}"\` : ""}>\${safeCode}</code></pre>\`;
      const key = \`@@CODEBLOCK_\${blocks.length}@@\`;
      blocks.push({ key, html });
      return key;
    });

    let safe = escapeHtml(withPlaceholders);
    const lines = safe.split("\\n");
    let out = "";
    let inUl = false;
    let inOl = false;
    let inBq = false;

    function closeLists() {
      if (inUl) { out += "</ul>"; inUl = false; }
      if (inOl) { out += "</ol>"; inOl = false; }
    }

    function closeBlockquote() {
      if (inBq) { out += "</blockquote>"; inBq = false; }
    }

    function closeAllBlocks() {
      closeLists();
      closeBlockquote();
    }

    for (const line of lines) {
      if (/^@@CODEBLOCK_\\d+@@$/.test(line.trim())) {
        closeAllBlocks();
        out += line.trim();
        continue;
      }

      if (inBq && line.trim() === "") {
        closeBlockquote();
        continue;
      }

      if (/^\\s*(?:---+|\\*\\*\\*+)\\s*$/.test(line)) {
        closeAllBlocks();
        out += '<hr class="md-hr">';
        continue;
      }

      const hm = line.match(/^\\s*(#{1,3})\\s+(.+)$/);
      if (hm) {
        closeAllBlocks();
        const lvl = hm[1].length;
        out += \`<h\${lvl} class="md-h md-h\${lvl}">\${renderInline(hm[2])}</h\${lvl}>\`;
        continue;
      }

      const bq = line.match(/^\\s*>\\s?(.*)$/);
      if (bq) {
        closeLists();
        if (!inBq) { out += '<blockquote class="md-blockquote">'; inBq = true; }
        const inner = bq[1];
        if (inner.trim() === "") {
          out += "<br>";
        } else {
          out += \`<div class="md-line md-bq-line">\${renderInline(inner)}</div>\`;
        }
        continue;
      }

      closeBlockquote();

      const ul = line.match(/^\\s*[-*]\\s+(.*)$/);
      const ol = line.match(/^\\s*(\\d+)\\.\\s+(.*)$/);

      if (ul) {
        if (inOl) { out += "</ol>"; inOl = false; }
        if (!inUl) { out += "<ul>"; inUl = true; }
        out += \`<li>\${renderInline(ul[1])}</li>\`;
        continue;
      }
      if (ol) {
        if (inUl) { out += "</ul>"; inUl = false; }
        if (!inOl) { out += "<ol>"; inOl = true; }
        out += \`<li>\${renderInline(ol[2])}</li>\`;
        continue;
      }

      closeLists();
      if (line.trim() === "") {
        out += "<br>";
      } else {
        out += \`<div class="md-line">\${renderInline(line)}</div>\`;
      }
    }
    closeAllBlocks();

    for (const b of blocks) {
      out = out.replaceAll(b.key, b.html);
    }

    return out;
  }

  window.renderMarkdown = renderMarkdown;
})();


// static/js/message.js

let lastLoadedMessageId = null;
let loadingMessages = false;
let isLoading = false;
let hasMore = true;
const messagesContainer = document.getElementById('messages');
const CHAT_TARGET_STORAGE_KEY = 'rochat.chatTarget';
const FILTER_CURRENT_TARGET_STORAGE_KEY = 'rochat.filterCurrentTargetOnly';
const FILTER_HIDE_OLDER_STORAGE_KEY = 'rochat.filterHideOlder';
const FILTER_HIDE_OLDER_SINCE_STORAGE_KEY = 'rochat.filterHideOlderSince';
const TARGET_TITLE_MAP = {};
let TARGET_SWITCH_RULES = [];
let DEFAULT_TARGET = 'local';
let targetToastTimer = null;

/** textarea 自适应高度（1～6 行）；发送清空后须再调用以缩回单行 */
function autosizeTextInput(input) {
    if (!input) input = document.getElementById('text-input');
    if (!input) return;
    input.style.height = 'auto';
    const cs = getComputedStyle(input);
    const lineH = parseFloat(cs.lineHeight) || 22;
    const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const minH = Math.max(44, lineH + padY);
    const maxH = Math.max(minH, 6 * lineH + padY);
    const sh = input.scrollHeight;
    input.style.height = Math.min(Math.max(sh, minH), maxH) + 'px';
}

function normalizeSwitchText(s) {
    return (s || '').trim().toLowerCase().replace(/\\s+/g, '');
}

function detectSwitchTargetByText(text) {
    const s = normalizeSwitchText(text);
    if (!s) return null;
    for (const rule of TARGET_SWITCH_RULES) {
        if (s.includes(rule.phrase)) return rule.targetId;
    }
    return null;
}

function getCurrentChatTarget() {
    const el = document.getElementById('chat-target');
    return (el && el.value) ? el.value : DEFAULT_TARGET;
}

function targetTitle(target) {
    return TARGET_TITLE_MAP[target] || target || '本地';
}

function updateTargetChip(target) {
    const chip = document.getElementById('current-target-chip');
    if (!chip) return;
    chip.textContent = targetTitle(target);
}

function showTargetToast(text) {
    let toast = document.getElementById('target-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'target-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.classList.add('show');
    if (targetToastTimer) clearTimeout(targetToastTimer);
    targetToastTimer = setTimeout(() => {
        toast.classList.remove('show');
    }, 1200);
}

function setCurrentChatTarget(target, options = {}) {
    const { notify = false } = options;
    const el = document.getElementById('chat-target');
    if (el && target) el.value = target;
    if (!target) return;
    localStorage.setItem(CHAT_TARGET_STORAGE_KEY, target);
    updateTargetChip(target);
    applyMessageTargetFilter();
    if (typeof refreshQuickCommandMenu === 'function') {
        refreshQuickCommandMenu(target);
    }
    if (typeof loadOldBuddyAvatars === 'function') {
        loadOldBuddyAvatars(target).then(() => {
            if (typeof refreshAllMessageAvatars === 'function') {
                refreshAllMessageAvatars();
            }
        });
    }
    if (notify) showTargetToast(\`已切换到：\${targetTitle(target)}\`);
}

document.addEventListener('DOMContentLoaded', () => {
    initTargetConfig().then(() => {
        const el = document.getElementById('chat-target');
        const filterBtn = document.getElementById('target-filter-toggle');
        const timeFilterBtn = document.getElementById('time-filter-toggle');
        const settingsToggle = document.getElementById('status-settings-toggle');
        const settingsMenu = document.getElementById('status-settings-menu');
        if (!el) return;
        const saved = localStorage.getItem(CHAT_TARGET_STORAGE_KEY);
        if (saved) {
            setCurrentChatTarget(saved, { notify: false });
        } else {
            setCurrentChatTarget(DEFAULT_TARGET, { notify: false });
        }
        const savedFilter = localStorage.getItem(FILTER_CURRENT_TARGET_STORAGE_KEY) === '1';
        setFilterCurrentTargetOnly(savedFilter, { notify: false });
        el.addEventListener('change', () => {
            setCurrentChatTarget(el.value, { notify: true });
        });
        if (filterBtn) {
            filterBtn.addEventListener('change', () => {
                setFilterCurrentTargetOnly(!!filterBtn.checked, { notify: true });
            });
        }
        const savedHideOlder = localStorage.getItem(FILTER_HIDE_OLDER_STORAGE_KEY) === '1';
        const savedHideOlderSince = localStorage.getItem(FILTER_HIDE_OLDER_SINCE_STORAGE_KEY);
        setHideOlderMessages(savedHideOlder, { notify: false, since: savedHideOlderSince });
        if (timeFilterBtn) {
            timeFilterBtn.addEventListener('change', () => {
                setHideOlderMessages(!!timeFilterBtn.checked, { notify: true });
            });
        }
        if (settingsToggle && settingsMenu) {
            settingsToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                settingsMenu.classList.toggle('open');
            });
            settingsMenu.addEventListener('click', (e) => e.stopPropagation());
            document.addEventListener('click', () => settingsMenu.classList.remove('open'));
        }
    });
});

function isFilterCurrentTargetOnly() {
    const btn = document.getElementById('target-filter-toggle');
    return !!(btn && btn.checked);
}

function setFilterCurrentTargetOnly(enabled, options = {}) {
    const { notify = false } = options;
    const btn = document.getElementById('target-filter-toggle');
    if (!btn) return;
    btn.checked = !!enabled;
    localStorage.setItem(FILTER_CURRENT_TARGET_STORAGE_KEY, enabled ? '1' : '0');
    applyMessageTargetFilter();
    if (notify) {
        showTargetToast(enabled ? '仅显示当前对象记录' : '显示全部对象记录');
    }
}

function isHideOlderMessagesEnabled() {
    const btn = document.getElementById('time-filter-toggle');
    return !!(btn && btn.checked);
}

function getHideOlderSinceMs() {
    const btn = document.getElementById('time-filter-toggle');
    if (!btn) return null;
    const raw = btn.dataset.sinceMs;
    if (!raw) return null;
    const ms = Number(raw);
    return Number.isFinite(ms) ? ms : null;
}

function setHideOlderMessages(enabled, options = {}) {
    const { notify = false, since = null } = options;
    const btn = document.getElementById('time-filter-toggle');
    if (!btn) return;
    const useEnabled = !!enabled;
    btn.checked = useEnabled;
    if (useEnabled) {
        let sinceMs = Date.now();
        if (since) {
            const parsed = Date.parse(since);
            if (Number.isFinite(parsed)) sinceMs = parsed;
        }
        btn.dataset.sinceMs = String(sinceMs);
        localStorage.setItem(FILTER_HIDE_OLDER_STORAGE_KEY, '1');
        localStorage.setItem(FILTER_HIDE_OLDER_SINCE_STORAGE_KEY, new Date(sinceMs).toISOString());
    } else {
        delete btn.dataset.sinceMs;
        localStorage.setItem(FILTER_HIDE_OLDER_STORAGE_KEY, '0');
        localStorage.removeItem(FILTER_HIDE_OLDER_SINCE_STORAGE_KEY);
    }
    applyMessageTargetFilter();
    if (notify) {
        showTargetToast(useEnabled ? '已隐藏当前时刻之前记录' : '已显示全部时间记录');
    }
}

function messageTargetOfNode(node) {
    const t = node.dataset.target || '';
    if (t) return t;
    // 兼容历史消息：无 target 视作 local
    return 'local';
}

function applyMessageTargetFilter() {
    const onlyCurrent = isFilterCurrentTargetOnly();
    const cur = getCurrentChatTarget();
    const hideOlder = isHideOlderMessagesEnabled();
    const sinceMs = getHideOlderSinceMs();
    const nodes = Array.from(messagesContainer.children);
    for (const node of nodes) {
        const mt = messageTargetOfNode(node);
        let visible = !onlyCurrent || mt === cur;
        if (visible && hideOlder && Number.isFinite(sinceMs)) {
            const msgTs = Date.parse(node.dataset.timestamp || '');
            visible = Number.isFinite(msgTs) ? msgTs >= sinceMs : true;
        }
        node.style.display = visible ? '' : 'none';
    }
    refreshTargetBadges();
}

async function initTargetConfig() {
    const selectEl = document.getElementById('chat-target');
    if (!selectEl) return;
    try {
        const res = await fetch('/oldbuddy/api/targets');
        if (!res.ok) throw new Error('load /api/targets failed');
        const cfg = await res.json();
        const targets = Array.isArray(cfg.targets) ? cfg.targets : [];
        DEFAULT_TARGET = cfg.default_target || DEFAULT_TARGET;

        TARGET_SWITCH_RULES = [];
        Object.keys(TARGET_TITLE_MAP).forEach((k) => delete TARGET_TITLE_MAP[k]);
        selectEl.innerHTML = '';

        for (const t of targets) {
            const tid = String(t.id || '').trim();
            if (!tid) continue;
            const label = String(t.label || tid);
            TARGET_TITLE_MAP[tid] = label;

            const opt = document.createElement('option');
            opt.value = tid;
            opt.textContent = label;
            selectEl.appendChild(opt);

            const phrases = Array.isArray(t.switch_phrases) ? t.switch_phrases : [];
            for (const phrase of phrases) {
                const norm = normalizeSwitchText(String(phrase || ''));
                if (norm) TARGET_SWITCH_RULES.push({ phrase: norm, targetId: tid });
            }
        }

        if (!TARGET_TITLE_MAP[DEFAULT_TARGET]) {
            const first = targets.find((t) => t && t.id)?.id;
            if (first) DEFAULT_TARGET = String(first);
        }
    } catch (e) {
        console.warn('[target] use fallback target options:', e);
        if (!TARGET_TITLE_MAP.local) {
            TARGET_TITLE_MAP.local = 'local';
            const opt = document.createElement('option');
            opt.value = 'local';
            opt.textContent = 'local';
            selectEl.appendChild(opt);
        }
        DEFAULT_TARGET = 'local';
    }
}
/**
 * 从后端加载消息
 */
// ---------- 历史消息加载 ----------
/**
 * 从后端加载历史消息（每次加载 limit 条，默认 10）
 * - 将历史消息按时间从旧到新插入到容器顶部（保持旧 -> 新 顺序）
 * - 在插入前记录滚动高度，插入后恢复视图位置，避免跳动
 * - 使用 isLoading / hasMore 锁来避免重复请求
 */
async function loadMessages(limit = 10) {
    // 如果正在加载或已经没有更多，则直接返回
    if (isLoading || !hasMore) return;
    isLoading = true;

    try {
        // 记录当前第一个可见节点，用于恢复滚动位置
        const firstVisible = messagesContainer.firstElementChild;
        const firstVisibleOffset = firstVisible ? firstVisible.getBoundingClientRect().top : null;

        // 记录旧的滚动高度（用于简单恢复）
        const oldScrollHeight = messagesContainer.scrollHeight;
        const oldScrollTop = messagesContainer.scrollTop;

        // 取出当前容器最顶部消息的 timestamp 作为 \`before\` 参数（如果存在）
        let before = null;
        const firstMsg = messagesContainer.firstElementChild;
        if (firstMsg && firstMsg.dataset && firstMsg.dataset.timestamp) {
            before = firstMsg.dataset.timestamp;
        }
        const url = before ? \`/oldbuddy/api/messages?before=\${encodeURIComponent(before)}&limit=\${limit}\` : \`/oldbuddy/api/messages?limit=\${limit}\`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('加载失败: ' + res.status);

        const data = await res.json();
        // 期待 data.messages 为数组，data.has_more 为 bool（根据你的后端）
        const msgs = Array.isArray(data.messages) ? data.messages : [];

        if (!msgs.length) {
            hasMore = false;
            return;
        }

        // 规范化并按时间降（新 -> 旧）排序，确保插入顺序正确
        msgs.sort((a, b) => {
            const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
            const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
            return tb - ta;
        });

        // 逐条在顶部插入（旧 -> 新 顺序）
        // 注意：使用 prependMessage 保证去重逻辑与 render 一致
        for (let i = 0; i < msgs.length; i++) {
            prependMessage(msgs[i]);
        }

        // 更新 hasMore（兼容后端返回字段名不同的情况）
        if (typeof data.has_more !== 'undefined') {
            hasMore = !!data.has_more;
        } else if (msgs.length < limit) {
            // 如果后端没有返回 has_more，且本次返回少于请求数量，则认为没有更多
            hasMore = false;
        } else {
            hasMore = true;
        }

        // 恢复滚动位置：方法一（简单且通常有效）
        // 让视图保持原先看到的消息在同一位置：
        // 新的 scrollHeight 增量 = messagesContainer.scrollHeight - oldScrollHeight
        // 将 scrollTop 增加这个增量（即保持可视区域相对不动）
        const newScrollHeight = messagesContainer.scrollHeight;
        const heightDiff = newScrollHeight - oldScrollHeight;
        // 仅在用户不在底部时恢复位置；如果用户本来在底部，保持底部
        const atBottom = (oldScrollHeight - oldScrollTop - messagesContainer.clientHeight) < 50;
        if (!atBottom) {
            messagesContainer.scrollTop = oldScrollTop + heightDiff;
        } else {
            // 如果用户在底部，保持在底部（避免加载历史时被拉走）
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }

    } catch (err) {
        console.error('loadMessages error', err);
    } finally {
        isLoading = false;
    }
}


/**
 * 为 messages 容器添加向上滚动到顶自动加载更多的逻辑
 * - 当 scrollTop <= threshold 时触发 loadMessages()
 * - 使用节流（基于 isLoading）避免连续触发
 */
/**
 * 替换用：为 messages 容器添加向上滚动到顶自动加载更多的逻辑（增强版）
 * - 支持桌面 scroll 事件
 * - 支持触摸下拉（当容器已到顶部并向下拉时触发）
 * - 使用 IntersectionObserver 作为补充（当第一个消息元素进入视口顶部时触发）
 *
 * 依赖外部变量/函数（保持不变）：
 * - messagesContainer (DOM 元素)
 * - isLoading (bool)
 * - hasMore (bool)
 * - loadMessages(limit)
 *
 * 参数：
 * - threshold: scrollTop 小于等于多少 px 时触发（桌面/滚动检测）
 * - touchPullThreshold: 手指下拉多少 px 时触发（触摸检测）
 */
function setupScrollLoader(threshold = 50, touchPullThreshold = 60) {
    if (!messagesContainer) return;

    // --- 桌面 / 常规滚动监听（保留） ---
    function onScroll() {
        // 当滚动到接近顶部时触发加载（threshold px）
        if (messagesContainer.scrollTop <= threshold) {
            if (!isLoading && hasMore) {
                // 请求更多历史消息
                loadMessages(20);
            }
        }
    }

    messagesContainer.addEventListener('scroll', onScroll, { passive: true });

    // --- 触摸设备支持：检测“下拉”动作 ---
    let touchStartY = null;
    let touchStartScrollTop = null;
    let touchTriggered = false;

    function onTouchStart(e) {
        if (!e.touches || e.touches.length === 0) return;
        touchStartY = e.touches[0].clientY;
        touchStartScrollTop = messagesContainer.scrollTop;
        touchTriggered = false;
    }

    function onTouchMove(e) {
        if (touchStartY === null) return;
        const curY = (e.touches && e.touches[0]) ? e.touches[0].clientY : null;
        if (curY === null) return;

        const deltaY = curY - touchStartY; // 向下为正

        // 仅在容器已经滚动到顶部（或非常接近顶部）时，才把下拉视为加载历史的动作
        // 使用小的容忍值确保跨浏览器适配（一些浏览器会有小数/弹性）
        const atTop = messagesContainer.scrollTop <= 2;

        if (atTop && deltaY > touchPullThreshold && !touchTriggered) {
            // 标记，避免同一次下拉触发多次
            touchTriggered = true;
            if (!isLoading && hasMore) {
                loadMessages(20);
            }
        }
        // 不阻止默认滚动行为（避免影响浏览器的原生回弹），因此不调用 e.preventDefault()
    }

    function onTouchEnd(/*e*/) {
        touchStartY = null;
        touchStartScrollTop = null;
        touchTriggered = false;
    }

    // 注意：不把 touch 监听设为 passive:true，因为我们并不调用 preventDefault，但保留默认即可
    messagesContainer.addEventListener('touchstart', onTouchStart, { passive: true });
    messagesContainer.addEventListener('touchmove', onTouchMove, { passive: true });
    messagesContainer.addEventListener('touchend', onTouchEnd, { passive: true });
    messagesContainer.addEventListener('touchcancel', onTouchEnd, { passive: true });

    // --- IntersectionObserver 备选方案（当第一个消息元素进入视口顶部时触发） ---
    // 这对于某些移动浏览器 scroll/触摸事件行为奇怪的情况非常有用
    let io = null;
    try {
        io = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                // 当第一个消息元素与容器的顶部（或接近顶部）相交时触发加载
                if (entry.isIntersecting) {
                    // 进一步验证：确保容器的 scrollTop 接近顶部
                    if ((messagesContainer.scrollTop <= threshold + 2) && !isLoading && hasMore) {
                        loadMessages(20);
                    }
                }
            }
        }, {
            root: messagesContainer,
            rootMargin: '0px 0px -90% 0px', // 元素进入顶部 10% 可视区域时触发（可调）
            threshold: 0
        });

        // 观察当前第一个元素（若存在）
        const observeFirst = () => {
            // 取消之前的观察
            io.disconnect();
            const first = messagesContainer.firstElementChild;
            if (first) io.observe(first);
        };

        // 每次插入/移除消息时可能需要重新观察（这里做个简单的周期检测）
        // 如果你在 prependMessage/appendMessage 中有 hook，也可以直接在那些地方调用 observeFirst()
        observeFirst();
        // 监听子节点变化以重新绑定 observer（节省资源，只有当 children 变化时才重置）
        const mo = new MutationObserver((mutations) => {
            // 只在 children 发生变化的时候重新观察第一个元素
            for (const m of mutations) {
                if (m.type === 'childList') {
                    observeFirst();
                    break;
                }
            }
        });
        mo.observe(messagesContainer, { childList: true });
    } catch (e) {
        // 若环境不支持 IntersectionObserver（极少见），忽略即可
        console.warn('IntersectionObserver not available or failed to init', e);
    }

    // --- 可选：返回一个函数用于解绑所有监听（如果你需要单元测试或销毁） ---
    // 例如： const teardown = setupScrollLoader(...); teardown();
    return function teardown() {
        messagesContainer.removeEventListener('scroll', onScroll);
        messagesContainer.removeEventListener('touchstart', onTouchStart);
        messagesContainer.removeEventListener('touchmove', onTouchMove);
        messagesContainer.removeEventListener('touchend', onTouchEnd);
        messagesContainer.removeEventListener('touchcancel', onTouchEnd);
        if (io) {
            try { io.disconnect(); } catch (e) {}
        }
    };
}

/**
 * sender 为 user 或 user_* 时视作用户侧（右侧绿色气泡）
 */
function isUserSender(sender) {
    const s = String(sender ?? '').trim();
    return s === 'user' || s.startsWith('user_');
}

function messageSenderClass(sender) {
    if (isUserSender(sender)) return 'user';
    const s = String(sender || '').trim();
    return s || 'buddy';
}

/**
 * 是否使用「卡片」式 Markdown 气泡（更宽、层次更清晰）
 * - 后端可设 msg.card === true
 * - 系统 / 调试侧消息默认按卡片展示
 */
function useMarkdownCard(msg) {
    if (msg.card === true || msg.card === "true" || msg.card === 1) return true;
    const s = msg.sender || "";
    return /^(system|debug)/.test(s);
}

function isVideoMediaUrl(url) {
    return /\\.(mp4|mov|m4v|mkv|3gp|webm)(\\?|#|$)/i.test(String(url || ''));
}

function appendExtraText(contentDiv, msg) {
    if (!msg.extra_text) return;
    const extra = document.createElement('div');
    extra.className = 'message-extra-text';
    if (typeof window.renderMarkdown === 'function') {
        extra.classList.add('markdown');
        if (useMarkdownCard(msg)) extra.classList.add('markdown-card');
        extra.innerHTML = window.renderMarkdown(msg.extra_text);
    } else {
        extra.textContent = msg.extra_text;
    }
    contentDiv.appendChild(extra);
}

function createVideoElement(src) {
    const video = document.createElement('video');
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.setAttribute('webkit-playsinline', 'true');
    video.setAttribute('x5-playsinline', 'true');
    video.src = src;
    video.className = 'message-video';
    return video;
}

function createAudioElement(src) {
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.src = src;
    audio.className = 'message-audio';
    return audio;
}

/**
 * 渲染单条消息（支持 prependMessage 从旧到新加载逻辑）
 */
function renderMessage(msg) {
    const div = document.createElement('div');
    const mid = msg.id ?? (\`local_\${Date.now()}_\${Math.random().toString(36).slice(2, 8)}\`);
    div.className = \`message \${messageSenderClass(msg.sender)}\`;
    div.dataset.id = mid;
    div.dataset.sender = msg.sender || '';
    div.dataset.target = msg.target || '';

    // ---------- 时间 ----------
    let t;
    try {
        t = msg.timestamp ? new Date(msg.timestamp) : new Date();
    } catch (e) {
        t = new Date();
    }
    div.dataset.timestamp = t.toISOString();

    // 默认时间节点
    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    // 判断是否为今天
    const now = new Date();
    const isToday =
        t.getFullYear() === now.getFullYear() &&
        t.getMonth() === now.getMonth() &&
        t.getDate() === now.getDate();
    if (isToday) {
        // 今天：显示 HH:MM
        timeDiv.textContent = t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
        // 非今天：显示 YYYY-MM-DD HH:MM
        const yyyy = t.getFullYear();
        const mm = String(t.getMonth() + 1).padStart(2, '0');
        const dd = String(t.getDate()).padStart(2, '0');
        const hh = String(t.getHours()).padStart(2, '0');
        const mi = String(t.getMinutes()).padStart(2, '0');
        timeDiv.textContent = \`\${yyyy}-\${mm}-\${dd} \${hh}:\${mi}\`;
    }
    div.appendChild(timeDiv);

    if (msg.target) {
        const targetDiv = document.createElement('div');
        targetDiv.className = 'message-target';
        targetDiv.textContent = \`对象：\${targetTitle(msg.target)}\`;
        div.appendChild(targetDiv);
    }

    // ---------- 时间显示逻辑 ----------
    const first = Array.from(messagesContainer.children).find(el => el.dataset.id !== msg.id);
    const last = Array.from([...messagesContainer.children].reverse()).find(el => el.dataset.id !== msg.id);

    const FIVE_MIN = 5 * 60 * 1000;
    const tMs = t.getTime();

    if (first && last) {
        const firstTime = new Date(first.dataset.timestamp).getTime();
        const lastTime = new Date(last.dataset.timestamp).getTime();

        if (tMs < firstTime) {
            // 向前插入（加载历史）
            if (firstTime - tMs < FIVE_MIN) {
                // 隐藏 firstElementChild 的时间
                const oldTimeNode = first.querySelector('.message-time');
                if (oldTimeNode) oldTimeNode.style.display = 'none';
            }
        } else if (tMs > lastTime) {
            // 向后插入（实时消息）
            if (tMs - lastTime < FIVE_MIN) {
                // 隐藏当前消息的时间
                timeDiv.style.display = 'none';
            }
        }
        // 中间插入（替换或乱序）保持默认时间显示
    }
    // ---------- 内容渲染 ----------
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    if (msg.type === 'text') {
        if (typeof window.renderMarkdown === 'function') {
            contentDiv.classList.add('markdown');
            if (useMarkdownCard(msg)) contentDiv.classList.add('markdown-card');
            contentDiv.innerHTML = window.renderMarkdown(msg.content);
        } else {
            contentDiv.textContent = msg.content;
        }
    } else if (msg.type === 'image') {
        const img = document.createElement('img');
        img.src = msg.content;
        img.className = 'message-image';
        contentDiv.appendChild(img);
        img.addEventListener('click', () => showImagePreview(msg.content));

        if (msg.extra_text) {
            const extra = document.createElement('div');
            extra.className = 'message-extra-text';
            if (typeof window.renderMarkdown === 'function') {
                extra.classList.add('markdown');
                if (useMarkdownCard(msg)) extra.classList.add('markdown-card');
                extra.innerHTML = window.renderMarkdown(msg.extra_text);
            } else {
                extra.textContent = msg.extra_text;
            }
            contentDiv.appendChild(extra);
        }
    } else if (msg.type === 'video' || (msg.type === 'audio' && isVideoMediaUrl(msg.content))) {
        contentDiv.appendChild(createVideoElement(msg.content));
        appendExtraText(contentDiv, msg);
    } else if (msg.type === 'audio') {
        contentDiv.appendChild(createAudioElement(msg.content));
        appendExtraText(contentDiv, msg);
    } else if (msg.type === 'file') {
        const link = document.createElement('a');
        link.href = msg.content;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = msg.file_name || '下载文件';
        if (msg.file_name) {
            link.download = msg.file_name;
        }
        contentDiv.appendChild(link);

        if (msg.file_size) {
            const meta = document.createElement('div');
            meta.className = 'message-extra-text';
            meta.textContent = \`大小: \${msg.file_size} 字节\`;
            contentDiv.appendChild(meta);
        }

        if (msg.extra_text) {
            const extra = document.createElement('div');
            extra.className = 'message-extra-text';
            if (typeof window.renderMarkdown === 'function') {
                extra.classList.add('markdown');
                if (useMarkdownCard(msg)) extra.classList.add('markdown-card');
                extra.innerHTML = window.renderMarkdown(msg.extra_text);
            } else {
                extra.textContent = msg.extra_text;
            }
            contentDiv.appendChild(extra);
        }
    } else {
        contentDiv.textContent = msg.content || JSON.stringify(msg);
    }

    if (typeof wrapMessageWithAvatar === 'function') {
        wrapMessageWithAvatar(div, msg, contentDiv);
    } else {
        div.appendChild(contentDiv);
    }
    return div;
}

/**
 * 目标标签去重显示：
 * 仅当 target 相对上一条可见消息发生变化时显示“对象：xxx”。
 */
function refreshTargetBadges() {
    let prevTarget = null;
    const nodes = Array.from(messagesContainer.children);
    for (const node of nodes) {
        if (node.style.display === 'none') continue;
        const badge = node.querySelector('.message-target');
        if (!badge) continue;
        const target = node.dataset.target || '';
        if (!target) {
            badge.style.display = 'none';
            continue;
        }
        if (target === prevTarget) {
            badge.style.display = 'none';
        } else {
            badge.style.display = '';
            prevTarget = target;
        }
    }
}


/**
 * 点击图片时弹出预览层（全屏放大）
 */

/**
 * 点击图片时弹出预览层（兼容 Firefox 桌面）
 */
function showImagePreview(src) {
    // 移除旧的预览层
    const existing = document.getElementById('image-preview-overlay');
    if (existing) existing.remove();

    // 创建遮罩层
    const overlay = document.createElement('div');
    overlay.id = 'image-preview-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.background = 'rgba(0,0,0,0.8)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '9999';
    overlay.style.cursor = 'zoom-out';
    overlay.style.pointerEvents = 'auto';  // 🔹 确保点击有效

    // 创建放大图片
    const bigImg = document.createElement('img');
    bigImg.src = src;
    bigImg.style.maxWidth = '90vw';
    bigImg.style.maxHeight = '90vh';
    bigImg.style.borderRadius = '8px';
    bigImg.style.boxShadow = '0 0 12px rgba(255,255,255,0.4)';
    bigImg.style.transition = 'transform 0.2s ease';
    bigImg.style.cursor = 'zoom-out';
    bigImg.style.userSelect = 'none';
    bigImg.style.pointerEvents = 'auto';

    // 🔹 点击遮罩关闭
    overlay.addEventListener('click', (e) => {
        // 仅当点击背景时关闭，不在图片上关闭
        if (e.target === overlay) {
            overlay.remove();
        }
    }, true); // 🔹 捕获阶段，确保 Firefox 能触发

    // 🔹 键盘 ESC 关闭（桌面端）
    function handleKey(e) {
        if (e.key === 'Escape') {
            overlay.remove();
            document.removeEventListener('keydown', handleKey);
        }
    }
    document.addEventListener('keydown', handleKey);

    overlay.appendChild(bigImg);
    document.body.appendChild(overlay);

    // 🔹 禁止页面滚动（桌面端常见问题）
    document.body.style.overflow = 'hidden';

    overlay.addEventListener('remove', () => {
        document.body.style.overflow = '';
    });
}

// 查找已存在的消息节点
function findMessageNode(id) {
    if (!id) return null;
    return messagesContainer.querySelector(\`[data-id="\${id}"]\`);
}

function messageNodeSignature(msg) {
    return [
        msg.type || '',
        msg.content || '',
        msg.extra_text || '',
        msg.file_name || '',
        msg.sender || '',
        msg.target || '',
    ].join('\\x1e');
}

function shouldSkipMessageRerender(existingNode, msg) {
    if (!existingNode) return false;
    return existingNode.dataset.sig === messageNodeSignature(msg);
}

/**
 * 向顶部插入消息
 */
function prependMessage(msg) {
    const id = msg.id ?? null;
    const existingNode = id ? findMessageNode(id) : null;
    if (shouldSkipMessageRerender(existingNode, msg)) {
        applyMessageTargetFilter();
        return;
    }
    const node = renderMessage(msg);
    node.dataset.sig = messageNodeSignature(msg);

    if (existingNode) {
        messagesContainer.replaceChild(node, existingNode); // 替换旧节点
    } else {
        messagesContainer.insertBefore(node, messagesContainer.firstChild);
    }
    applyMessageTargetFilter();
}

/**
 * 向底部追加消息
 */


function appendMessage(msg) {
    const id = msg.id ?? null;
    const existingNode = id ? findMessageNode(id) : null;
    if (shouldSkipMessageRerender(existingNode, msg)) {
        applyMessageTargetFilter();
        return;
    }
    const node = renderMessage(msg);
    node.dataset.sig = messageNodeSignature(msg);

    // 追加前判断用户是否在底部（用旧 scrollHeight 判断才准确）
    const wasAtBottom = (messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight) < 50;

    if (existingNode) {
        messagesContainer.replaceChild(node, existingNode); // 替换旧节点
    } else {
        messagesContainer.appendChild(node);
    }
    applyMessageTargetFilter();

    // 自动滚到底部（仅当用户原本在底部时才滚动，避免打断）
    if (wasAtBottom) messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

/** 浏览器 WGS84 → 国内地图常用坐标（高德 GCJ-02、百度 BD-09） */
const _EARTH_PI = Math.PI;
const _X_PI = (_EARTH_PI * 3000) / 180;

function _outOfChina(lng, lat) {
    return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function _transformLat(lng, lat) {
    let ret =
        -100.0 +
        2.0 * lng +
        3.0 * lat +
        0.2 * lat * lat +
        0.1 * lng * lat +
        0.2 * Math.sqrt(Math.abs(lng));
    ret += ((20.0 * Math.sin(6.0 * lng * _EARTH_PI) + 20.0 * Math.sin(2.0 * lng * _EARTH_PI)) * 2.0) / 3.0;
    ret += ((20.0 * Math.sin(lat * _EARTH_PI) + 40.0 * Math.sin((lat / 3.0) * _EARTH_PI)) * 2.0) / 3.0;
    ret += ((160.0 * Math.sin((lat / 12.0) * _EARTH_PI) + 320 * Math.sin((lat * _EARTH_PI) / 30.0)) * 2.0) / 3.0;
    return ret;
}

function _transformLng(lng, lat) {
    let ret =
        300.0 +
        lng +
        2.0 * lat +
        0.1 * lng * lng +
        0.1 * lng * lat +
        0.1 * Math.sqrt(Math.abs(lng));
    ret += ((20.0 * Math.sin(6.0 * lng * _EARTH_PI) + 20.0 * Math.sin(2.0 * lng * _EARTH_PI)) * 2.0) / 3.0;
    ret += ((20.0 * Math.sin(lng * _EARTH_PI) + 40.0 * Math.sin((lng / 3.0) * _EARTH_PI)) * 2.0) / 3.0;
    ret += ((150.0 * Math.sin((lng / 12.0) * _EARTH_PI) + 300.0 * Math.sin((lng / 30.0) * _EARTH_PI)) * 2.0) / 3.0;
    return ret;
}

function wgs84ToGcj02(lng, lat) {
    if (_outOfChina(lng, lat)) return [lng, lat];
    const a = 6378245.0;
    const ee = 0.00669342162296594323;
    let dLat = _transformLat(lng - 105.0, lat - 35.0);
    let dLng = _transformLng(lng - 105.0, lat - 35.0);
    const radLat = (lat / 180.0) * _EARTH_PI;
    let magic = Math.sin(radLat);
    magic = 1 - ee * magic * magic;
    const sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / (((a * (1 - ee)) / (magic * sqrtMagic)) * _EARTH_PI);
    dLng = (dLng * 180.0) / ((a / sqrtMagic) * Math.cos(radLat) * _EARTH_PI);
    return [lng + dLng, lat + dLat];
}

function gcj02ToBd09(lng, lat) {
    const z = Math.sqrt(lng * lng + lat * lat) + 0.00002 * Math.sin(lat * _X_PI);
    const theta = Math.atan2(lat, lng) + 0.000003 * Math.cos(lng * _X_PI);
    return [z * Math.cos(theta) + 0.0065, z * Math.sin(theta) + 0.006];
}

function wgs84ToBd09(lng, lat) {
    const [gjLng, gjLat] = wgs84ToGcj02(lng, lat);
    if (_outOfChina(lng, lat)) return [gjLng, gjLat];
    return gcj02ToBd09(gjLng, gjLat);
}

/**
 * 获取浏览器定位并写入输入框（含经纬度与地图链接），由用户手动点击发送。
 * 需在 HTTPS 或 localhost 等安全上下文中；手机会弹出系统定位授权。
 */
async function sendLocationMessage() {
    const btn = document.getElementById('location-btn');
    const input = document.getElementById('text-input');
    if (!navigator.geolocation) {
        alert('当前浏览器不支持定位');
        return;
    }
    const prev = btn ? btn.textContent : '';
    if (btn) {
        btn.disabled = true;
        btn.textContent = '…';
    }
    const buildContent = (lat, lng, acc, ts) => {
        const lines = [
            '📍 当前位置',
            \`纬度: \${lat.toFixed(6)}\`,
            \`经度: \${lng.toFixed(6)}\`,
        ];
        if (acc != null && Number.isFinite(acc)) {
            lines.push(\`精度约: ±\${Math.round(acc)} m\`);
        }
        if (ts) {
            lines.push(\`定位时间: \${new Date(ts).toISOString()}\`);
        }
        const [gcjLng, gcjLat] = wgs84ToGcj02(lng, lat);
        const [bdLng, bdLat] = wgs84ToBd09(lng, lat);
        const nameQ = encodeURIComponent('当前位置');
        const osmUrl = \`https://www.openstreetmap.org/?mlat=\${lat}&mlon=\${lng}#map=16/\${lat}/\${lng}\`;
        const amapUrl = \`https://uri.amap.com/marker?position=\${gcjLng},\${gcjLat}&name=\${nameQ}\`;
        const baiduUrl = \`https://api.map.baidu.com/marker?location=\${bdLat},\${bdLng}&title=\${nameQ}&content=&output=html\`;
        lines.push(\`[OpenStreetMap](\${osmUrl})\`);
        lines.push(\`[高德地图](\${amapUrl})\`);
        lines.push(\`[百度地图](\${baiduUrl})\`);
        return lines.join('\\n');
    };

    await new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { latitude, longitude, accuracy } = pos.coords;
                const content = buildContent(latitude, longitude, accuracy, pos.timestamp);
                if (input) {
                    const prefix = input.value && input.value.trim() ? \`\${input.value}\\n\\n\` : '';
                    input.value = \`\${prefix}\${content}\`;
                    autosizeTextInput(input);
                    input.focus();
                }
                resolve();
            },
            (err) => {
                const msg =
                    err && err.code === 1
                        ? '已拒绝定位权限，请在系统或浏览器设置中允许本站使用位置。'
                        : err && err.code === 2
                          ? '暂时无法获取位置信息。'
                          : err && err.code === 3
                            ? '定位超时，请重试或到信号较好的地方再试。'
                            : \`定位失败：\${err && err.message ? err.message : '未知错误'}\`;
                alert(msg);
                resolve();
            },
            { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 },
        );
    });

    if (btn) {
        btn.disabled = false;
        btn.textContent = prev;
    }
}

/**
 * 发送文本消息
 */
async function sendTextMessage() {
    const input = document.getElementById('text-input');
    const sendBtn = document.getElementById('send-text');
    let content = input.value.trim();
    if (!content) return;
    const switchTarget = detectSwitchTargetByText(content);
    if (switchTarget) {
        setCurrentChatTarget(switchTarget, { notify: true });
    }
    const target = getCurrentChatTarget();

    // 防重复发送：禁用按钮并视觉提示
    sendBtn.disabled = true;
    const prevBtnText = sendBtn.textContent;
    sendBtn.textContent = '发送中...';

    // 清空输入框（先保存内容以防后续需要重试）
    input.value = '';
    autosizeTextInput(input);

    try {
        const res = await fetch('/oldbuddy/api/message/text', {
            method: 'POST',
            body: new URLSearchParams({ content, sender: 'user', target })
        });

        if (!res.ok) {
            // 如果服务器返回错误，恢复输入框并提示
            const text = await res.text().catch(() => '');
            console.error('send text failed', res.status, text);
            alert('发送失败：服务器返回错误');
            // 将内容放回输入框（可选）
            input.value = content;
            autosizeTextInput(input);
            return;
        }

        const data = await res.json();
        if (data && data.message) {
            // 把服务器返回的消息追加到页面（response + websocket 去重一起生效）
            appendMessage(data.message);
        } else {
            console.error('send text no message in response', data);
            // 将内容放回输入框（可选）
            input.value = content;
            autosizeTextInput(input);
        }
    } catch (e) {
        console.error('sendTextMessage error', e);
        alert('发送失败：网络或其他错误');
        // 将内容放回输入框（可选）
        input.value = content;
        autosizeTextInput(input);
    } finally {
        // 恢复按钮
        sendBtn.disabled = false;
        sendBtn.textContent = prevBtnText;
        // 滚动由 appendMessage 负责（此处避免重复计算导致偶发不滚动）
    }
}


// static/js/avatars.js — 头像/昵称（nochain_oldbuddy_avatar）

let OLDBUDDY_AVATAR_MAP = {};

function resolveAvatarUrl(path) {
    if (!path) return '';
    const p = String(path).trim();
    if (!p) return '';
    if (/^https?:\\/\\//i.test(p)) return p;
    if (p.startsWith('/')) return p;
    return \`/oldbuddy/api/vault_asset?path=\${encodeURIComponent(p)}\`;
}

function resolveSenderProfile(sender) {
    const id = String(sender ?? '').trim() || 'buddy';
    const map = OLDBUDDY_AVATAR_MAP || {};
    if (map[id]) {
        return { ...map[id], id };
    }
    if (typeof isUserSender === 'function' && isUserSender(id) && map.user) {
        return { ...map.user, id };
    }
    if (map.buddy && (typeof isUserSender !== 'function' || !isUserSender(id))) {
        return { ...map.buddy, id };
    }
    if (map['*']) {
        return { ...map['*'], id };
    }
    return { id, name: id, avatar: '' };
}

function shouldShowNickname(sender, profile) {
    if (!profile?.name) return false;
    const s = String(sender ?? '').trim();
    if (s === 'user') return false;
    if (typeof isUserSender === 'function' && isUserSender(s)) return true;
    return true;
}

function createMessageAvatarEl(profile) {
    const wrap = document.createElement('div');
    wrap.className = 'message-avatar';
    const url = resolveAvatarUrl(profile.avatar);
    const fallbackChar = (profile.name || profile.id || '?').slice(0, 1);

    const showFallback = () => {
        wrap.textContent = fallbackChar;
        wrap.classList.add('message-avatar-fallback');
        const img = wrap.querySelector('img');
        if (img) img.remove();
    };

    if (url) {
        const img = document.createElement('img');
        img.src = url;
        img.alt = profile.name || '';
        img.loading = 'lazy';
        img.addEventListener('error', showFallback, { once: true });
        wrap.appendChild(img);
    } else {
        showFallback();
    }
    return wrap;
}

function wrapMessageWithAvatar(div, msg, contentDiv) {
    const profile = resolveSenderProfile(msg.sender);
    const row = document.createElement('div');
    row.className = 'message-row';

    const avatar = createMessageAvatarEl(profile);
    const body = document.createElement('div');
    body.className = 'message-body';

    if (shouldShowNickname(msg.sender, profile)) {
        const nick = document.createElement('div');
        nick.className = 'message-nickname';
        nick.textContent = profile.name;
        body.appendChild(nick);
    }

    body.appendChild(contentDiv);

    if (typeof isUserSender === 'function' && isUserSender(msg.sender)) {
        row.classList.add('message-row-user');
        row.appendChild(body);
        row.appendChild(avatar);
    } else {
        row.appendChild(avatar);
        row.appendChild(body);
    }

    div.appendChild(row);
}

async function loadOldBuddyAvatars(target) {
    const tid =
        target ||
        (typeof getCurrentChatTarget === 'function' ? getCurrentChatTarget() : 'local');
    try {
        const res = await fetch(
            \`/oldbuddy/api/avatars?target=\${encodeURIComponent(tid || 'local')}\`,
        );
        if (!res.ok) throw new Error('avatars fetch failed');
        const data = await res.json();
        OLDBUDDY_AVATAR_MAP = data.avatars && typeof data.avatars === 'object' ? data.avatars : {};
    } catch (e) {
        console.warn('[oldbuddy] load avatars failed', e);
        OLDBUDDY_AVATAR_MAP = {};
    }
}

function refreshAllMessageAvatars() {
    const container = document.getElementById('messages');
    if (!container) return;
    container.querySelectorAll('.message').forEach((node) => {
        const row = node.querySelector('.message-row');
        if (!row) return;
        const sender = node.dataset.sender || '';
        const profile = resolveSenderProfile(sender);
        const avatarWrap = row.querySelector('.message-avatar');
        if (avatarWrap) {
            const fresh = createMessageAvatarEl(profile);
            avatarWrap.replaceWith(fresh);
        }
        const nick = row.querySelector('.message-nickname');
        if (shouldShowNickname(sender, profile)) {
            if (nick) {
                nick.textContent = profile.name;
            } else {
                const body = row.querySelector('.message-body');
                if (body) {
                    const el = document.createElement('div');
                    el.className = 'message-nickname';
                    el.textContent = profile.name;
                    body.insertBefore(el, body.firstChild);
                }
            }
        } else if (nick) {
            nick.remove();
        }
    });
}


// static/js/quick_commands.js
let quickCmdMenu = null;

function getQuickCommandTarget() {
    return (typeof getCurrentChatTarget === "function")
        ? getCurrentChatTarget()
        : "local";
}

async function loadQuickCommandsForTarget(target) {
    const url = \`/oldbuddy/api/quick_commands?target=\${encodeURIComponent(target || "local")}\`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("获取快捷命令失败");
    const data = await res.json();
    return data.commands ?? [];
}

function renderQuickCommandButtons(menu, cmds) {
    menu.innerHTML = "";
    cmds.forEach(cmd => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = cmd.label;
        btn.dataset.cmdId = cmd.id;
        btn.dataset.cmdText = cmd.text;
        btn.style.cssText = \`
            padding:8px; border:none; background:transparent; text-align:left;
            cursor:pointer; width:100%;
        \`;
        btn.onmouseover = () => btn.style.background = "#f5f5f5";
        btn.onmouseout = () => btn.style.background = "transparent";
        btn.onclick = async (e) => {
            e.stopPropagation();
            menu.style.display = "none";
            await sendQuickCommand(btn.dataset.cmdText, btn.dataset.cmdId);
        };
        menu.appendChild(btn);
    });
}

async function refreshQuickCommandMenu(target) {
    if (!quickCmdMenu) return;
    const tid = target || getQuickCommandTarget();
    try {
        const cmds = await loadQuickCommandsForTarget(tid);
        renderQuickCommandButtons(quickCmdMenu, cmds);
    } catch (err) {
        console.error("[quick_commands] 刷新失败：", err);
        quickCmdMenu.innerHTML = "";
    }
}

async function createQuickCommandUI() {
    const statusBar = document.getElementById("status-bar");
    const quickBtn = document.createElement("button");
    quickBtn.id = "quick-cmd-btn";
    quickBtn.type = "button";
    quickBtn.title = "快捷命令";
    quickBtn.textContent = "⚡";
    quickBtn.style.cssText = \`
        margin-right:8px; border:none; background:transparent; cursor:pointer;
        font-size:16px; padding:0 6px; height:22px; display:flex; align-items:center;
    \`;
    const statusDot = document.getElementById("status-dot");
    statusBar.insertBefore(quickBtn, statusDot);

    const menu = document.createElement("div");
    menu.id = "quick-cmd-menu";
    menu.style.cssText = \`
        position:absolute; top:34px; left:10px; background:#fff; border:1px solid #ccc;
        border-radius:6px; display:none; flex-direction:column; z-index:1002; min-width:140px;
        box-shadow:0 6px 18px rgba(0,0,0,0.12); padding:6px 6px;
    \`;
    document.body.appendChild(menu);
    quickCmdMenu = menu;

    await refreshQuickCommandMenu(getQuickCommandTarget());

    quickBtn.onclick = (e) => {
        e.stopPropagation();
        menu.style.display = menu.style.display === "none" ? "block" : "none";
        const rect = quickBtn.getBoundingClientRect();
        menu.style.left = \`\${Math.max(8, rect.left)}px\`;
    };

    document.addEventListener("click", () => { menu.style.display = "none"; });
    menu.addEventListener("click", (e) => e.stopPropagation());
}

async function sendQuickCommand(text, cmdId = null) {
    if (!text) return;
    try {
        const target = getQuickCommandTarget();
        const res = await fetch('/oldbuddy/api/message/text', {
            method: "POST",
            body: new URLSearchParams({
                content: text,
                sender: "user",
                quick_cmd_id: cmdId || "",
                target
            })
        });
        if (!res.ok) throw new Error("服务器返回错误");
        const data = await res.json();
        if (data?.message && typeof appendMessage === "function") {
            appendMessage(data.message);
        }
    } catch (err) {
        console.error("[quick_commands] 发送失败：", err);
        alert("发送快捷命令失败");
    }
}


// static/js/reference.js — 输入 @ 时浮层选择引用（微信群聊 @ 风格）

let referencePicker = null;
let referencePickerOpen = false;
let referenceItems = [];
let referenceHighlight = 0;
let referenceFetchTimer = null;
let referenceMentionRange = null;

function isReferencePickerOpen() {
    return referencePickerOpen;
}

function getReferenceTarget() {
    return typeof getCurrentChatTarget === 'function' ? getCurrentChatTarget() : 'local';
}

/** 光标前正在输入的 @ 片段；无则 null */
function getActiveMention(input) {
    if (!input) return null;
    const pos = input.selectionStart;
    if (pos == null) return null;
    const before = input.value.slice(0, pos);
    const match = before.match(/(^|[\\s\\u3000\\n])@([^\\s@\\u3000\\n]*)$/);
    if (!match) return null;
    const query = match[2] || '';
    const start = pos - query.length - 1;
    return { query, start, end: pos };
}

function ensureReferencePicker() {
    if (referencePicker) return referencePicker;
    const el = document.createElement('div');
    el.id = 'reference-picker';
    el.setAttribute('role', 'listbox');
    el.style.display = 'none';
    document.body.appendChild(el);
    referencePicker = el;
    return el;
}

function positionReferencePicker(input) {
    const picker = ensureReferencePicker();
    const inputBar = document.getElementById('input-bar');
    const rect = input.getBoundingClientRect();
    const barRect = inputBar ? inputBar.getBoundingClientRect() : rect;
    picker.style.left = \`\${Math.max(8, rect.left)}px\`;
    picker.style.width = \`\${Math.min(320, Math.max(200, rect.width))}px\`;
    picker.style.bottom = \`\${window.innerHeight - barRect.top + 6}px\`;
}

function hideReferencePicker() {
    referencePickerOpen = false;
    referenceMentionRange = null;
    referenceHighlight = 0;
    if (referencePicker) {
        referencePicker.style.display = 'none';
        referencePicker.innerHTML = '';
    }
}

function renderReferencePicker(items) {
    const picker = ensureReferencePicker();
    picker.innerHTML = '';
    referenceItems = items;
    referenceHighlight = 0;

    if (!items.length) {
        hideReferencePicker();
        return;
    }

    items.forEach((item, idx) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'reference-picker-item';
        row.setAttribute('role', 'option');
        row.dataset.index = String(idx);
        row.innerHTML = \`<span class="reference-picker-label">\${escapeHtml(item.label)}</span>\` +
            (item.text && item.text !== item.label
                ? \`<span class="reference-picker-sub">\${escapeHtml(item.text)}</span>\`
                : '');
        row.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            applyReferenceItem(item);
        };
        picker.appendChild(row);
    });

    updateReferenceHighlight();
    picker.style.display = 'block';
    referencePickerOpen = true;
}

function updateReferenceHighlight() {
    if (!referencePicker) return;
    const rows = referencePicker.querySelectorAll('.reference-picker-item');
    rows.forEach((row, i) => {
        row.classList.toggle('active', i === referenceHighlight);
    });
    const active = rows[referenceHighlight];
    if (active && typeof active.scrollIntoView === 'function') {
        active.scrollIntoView({ block: 'nearest' });
    }
}

function escapeHtml(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function applyReferenceItem(item) {
    const input = document.getElementById('text-input');
    if (!input || !referenceMentionRange) return;
    const insert = \`@\${item.label} \`;
    const val = input.value;
    const { start, end } = referenceMentionRange;
    input.value = val.slice(0, start) + insert + val.slice(end);
    const newPos = start + insert.length;
    input.setSelectionRange(newPos, newPos);
    if (typeof autosizeTextInput === 'function') {
        autosizeTextInput(input);
    }
    hideReferencePicker();
    input.focus();
}

async function fetchReferences(query) {
    const target = getReferenceTarget();
    const url = \`/oldbuddy/api/reference?target=\${encodeURIComponent(target)}&query=\${encodeURIComponent(query || '')}\`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.references) ? data.references : [];
}

function scheduleReferenceFetch(input, mention) {
    if (referenceFetchTimer) clearTimeout(referenceFetchTimer);
    referenceMentionRange = { start: mention.start, end: mention.end, query: mention.query };
    referenceFetchTimer = setTimeout(async () => {
        referenceFetchTimer = null;
        const inputNow = document.getElementById('text-input');
        if (!inputNow) return;
        const active = getActiveMention(inputNow);
        if (!active) {
            hideReferencePicker();
            return;
        }
        referenceMentionRange = { start: active.start, end: active.end, query: active.query };
        positionReferencePicker(inputNow);
        try {
            const items = await fetchReferences(active.query);
            if (!getActiveMention(inputNow)) {
                hideReferencePicker();
                return;
            }
            renderReferencePicker(items);
        } catch (e) {
            console.warn('[reference] fetch failed', e);
            hideReferencePicker();
        }
    }, 120);
}

function onReferenceInput() {
    const input = document.getElementById('text-input');
    if (!input) return;
    const mention = getActiveMention(input);
    if (!mention) {
        hideReferencePicker();
        return;
    }
    positionReferencePicker(input);
    scheduleReferenceFetch(input, mention);
}

function onReferenceKeydown(e) {
    if (!referencePickerOpen || !referenceItems.length) return false;
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        referenceHighlight = (referenceHighlight + 1) % referenceItems.length;
        updateReferenceHighlight();
        return true;
    }
    if (e.key === 'ArrowUp') {
        e.preventDefault();
        referenceHighlight = (referenceHighlight - 1 + referenceItems.length) % referenceItems.length;
        updateReferenceHighlight();
        return true;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        const item = referenceItems[referenceHighlight];
        if (item) applyReferenceItem(item);
        return true;
    }
    if (e.key === 'Escape') {
        e.preventDefault();
        hideReferencePicker();
        return true;
    }
    return false;
}

function initReferencePicker() {
    const input = document.getElementById('text-input');
    if (!input) return;

    input.addEventListener('input', onReferenceInput);
    input.addEventListener('click', onReferenceInput);
    input.addEventListener('keyup', onReferenceInput);
    input.addEventListener('keydown', (e) => {
        if (onReferenceKeydown(e)) return;
    }, true);

    document.addEventListener('click', (e) => {
        if (!referencePickerOpen) return;
        if (referencePicker && referencePicker.contains(e.target)) return;
        if (e.target === input) return;
        hideReferencePicker();
    });

    window.addEventListener('resize', () => {
        if (referencePickerOpen && input) positionReferencePicker(input);
    });
}


// static/js/upload.js

function createUploadOverlay() {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.background = 'rgba(0,0,0,0.6)';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '2000';
    return overlay;
}

function appendExtraTextRow(overlay, placeholder) {
    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.placeholder = placeholder || '输入附加文字...';
    textInput.style.marginTop = '10px';
    textInput.style.padding = '8px 12px';
    textInput.style.width = '60%';
    textInput.style.borderRadius = '20px';
    overlay.appendChild(textInput);
    return textInput;
}

function appendSendCancelButtons(overlay, onSend, onCancel, failLabel) {
    const btnWrapper = document.createElement('div');
    btnWrapper.style.marginTop = '10px';
    const sendBtn = document.createElement('button');
    sendBtn.textContent = '发送';
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '取消';
    btnWrapper.appendChild(sendBtn);
    btnWrapper.appendChild(cancelBtn);
    overlay.appendChild(btnWrapper);
    cancelBtn.onclick = () => {
        onCancel();
        if (overlay.parentNode) document.body.removeChild(overlay);
    };
    sendBtn.onclick = async () => {
        sendBtn.disabled = true;
        try {
            await onSend();
            if (overlay.parentNode) document.body.removeChild(overlay);
        } catch (e) {
            console.error(e);
            if (failLabel) alert(failLabel);
            sendBtn.disabled = false;
        }
    };
}

/** 录音 / 视频上传前预览并输入 extra_text */
function handleMediaUpload(fileOrBlob, kind, opts = {}) {
    const { filename, inputEl, failLabel } = opts;
    const isVideo = kind === 'video';
    const file = fileOrBlob instanceof File
        ? fileOrBlob
        : new File(
            [fileOrBlob],
            filename || \`\${isVideo ? 'video' : 'record'}_\${Date.now()}.\${isVideo ? 'mp4' : 'webm'}\`,
            { type: fileOrBlob.type || (isVideo ? 'video/mp4' : 'audio/webm') },
        );

    const overlay = createUploadOverlay();
    const label = document.createElement('div');
    label.textContent = isVideo ? \`视频: \${file.name}\` : \`录音: \${file.name}\`;
    label.style.background = '#fff';
    label.style.padding = '10px 14px';
    label.style.borderRadius = '8px';
    label.style.maxWidth = '80%';
    label.style.textAlign = 'center';
    overlay.appendChild(label);

    const objectUrl = URL.createObjectURL(file);
    if (isVideo) {
        const video = document.createElement('video');
        video.controls = true;
        video.playsInline = true;
        video.src = objectUrl;
        video.style.maxWidth = '80%';
        video.style.maxHeight = '40%';
        video.style.marginTop = '10px';
        video.style.borderRadius = '8px';
        video.style.background = '#000';
        overlay.appendChild(video);
    } else {
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.src = objectUrl;
        audio.style.width = 'min(80%, 320px)';
        audio.style.marginTop = '10px';
        overlay.appendChild(audio);
    }

    const textInput = appendExtraTextRow(overlay, '输入附加文字...');
    document.body.appendChild(overlay);

    const apiPath = isVideo ? '/oldbuddy/api/message/video' : '/oldbuddy/api/message/audio';
    const cleanup = () => URL.revokeObjectURL(objectUrl);
    appendSendCancelButtons(
        overlay,
        async () => {
            const formData = new FormData();
            formData.append('file', file, file.name);
            formData.append('sender', 'user');
            if (typeof getCurrentChatTarget === 'function') formData.append('target', getCurrentChatTarget());
            const extra_text = textInput.value.trim();
            if (extra_text) formData.append('extra_text', extra_text);
            const res = await fetch(apiPath, { method: 'POST', body: formData });
            const data = await res.json();
            if (data && data.message) appendMessage(data.message);
            cleanup();
        },
        () => {
            cleanup();
            if (inputEl) inputEl.value = '';
        },
        failLabel || (isVideo ? '视频上传失败' : '录音上传失败'),
    );
}

// ---------- 图片上传（预览 + 文字组合发送） ----------
function mimeToImageExt(mime) {
    const m = String(mime || '').toLowerCase();
    if (m.includes('png')) return 'png';
    if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
    if (m.includes('webp')) return 'webp';
    if (m.includes('gif')) return 'gif';
    return 'png';
}

function extractPastedImageFile(clipboardData) {
    if (!clipboardData?.items?.length) return null;
    for (const item of clipboardData.items) {
        if (item.kind !== 'file' || !String(item.type || '').startsWith('image/')) continue;
        const blob = item.getAsFile();
        if (!blob) continue;
        if (blob.name) return blob;
        const ext = mimeToImageExt(item.type || blob.type);
        return new File([blob], \`paste_\${Date.now()}.\${ext}\`, { type: item.type || blob.type || 'image/png' });
    }
    return null;
}

function initPasteImageHandler() {
    const textInput = document.getElementById('text-input');
    if (!textInput) return;
    textInput.addEventListener('paste', (e) => {
        if (typeof isReferencePickerOpen === 'function' && isReferencePickerOpen()) return;
        const file = extractPastedImageFile(e.clipboardData);
        if (!file) return;
        e.preventDefault();
        handleImageFile(file);
    });
}

async function handleImageFile(file) {
    if (!file) return;
    const previewOverlay = document.createElement('div');
    previewOverlay.style.position = 'fixed'; previewOverlay.style.top = '0'; previewOverlay.style.left = '0';
    previewOverlay.style.width = '100%'; previewOverlay.style.height = '100%';
    previewOverlay.style.background = 'rgba(0,0,0,0.6)'; previewOverlay.style.display = 'flex';
    previewOverlay.style.flexDirection = 'column'; previewOverlay.style.alignItems = 'center';
    previewOverlay.style.justifyContent = 'center'; previewOverlay.style.zIndex = '2000';

    const img = document.createElement('img'); img.src = URL.createObjectURL(file);
    img.style.maxWidth = '80%'; img.style.maxHeight = '50%'; img.style.borderRadius = '8px';
    previewOverlay.appendChild(img);

    const textInput = document.createElement('input'); textInput.type = 'text'; textInput.placeholder = '输入文字...';
    textInput.style.marginTop = '10px'; textInput.style.padding = '8px 12px'; textInput.style.width = '60%'; textInput.style.borderRadius = '20px';
    previewOverlay.appendChild(textInput);

    const btnWrapper = document.createElement('div'); btnWrapper.style.marginTop = '10px';
    const sendBtn = document.createElement('button'); sendBtn.textContent = '发送';
    const cancelBtn = document.createElement('button'); cancelBtn.textContent = '取消';
    btnWrapper.appendChild(sendBtn); btnWrapper.appendChild(cancelBtn);
    previewOverlay.appendChild(btnWrapper);
    document.body.appendChild(previewOverlay);

    cancelBtn.onclick = () => { document.body.removeChild(previewOverlay); }
    sendBtn.onclick = async () => {
        const formData = new FormData(); formData.append('file', file); formData.append('sender', 'user');
        if (typeof getCurrentChatTarget === 'function') formData.append('target', getCurrentChatTarget());
        const extra_text = textInput.value.trim(); if (extra_text) formData.append('extra_text', extra_text);
        try { const res = await fetch('/oldbuddy/api/message/image', { method: 'POST', body: formData }); const data = await res.json(); if (data && data.message) appendMessage(data.message); }
        catch (e) { console.error(e); alert('上传失败'); }
        document.body.removeChild(previewOverlay);
    };
}

// ---------- 任意文件上传（弹窗 + 文字组合发送） ----------
async function handleAnyFile(file, inputEl) {
    if (!file) return;

    const previewOverlay = document.createElement('div');
    previewOverlay.style.position = 'fixed'; previewOverlay.style.top = '0'; previewOverlay.style.left = '0';
    previewOverlay.style.width = '100%'; previewOverlay.style.height = '100%';
    previewOverlay.style.background = 'rgba(0,0,0,0.6)'; previewOverlay.style.display = 'flex';
    previewOverlay.style.flexDirection = 'column'; previewOverlay.style.alignItems = 'center';
    previewOverlay.style.justifyContent = 'center'; previewOverlay.style.zIndex = '2000';

    const fileInfo = document.createElement('div');
    fileInfo.textContent = \`文件: \${file.name}\`;
    fileInfo.style.background = '#fff';
    fileInfo.style.padding = '10px 14px';
    fileInfo.style.borderRadius = '8px';
    previewOverlay.appendChild(fileInfo);

    const textInput = document.createElement('input'); textInput.type = 'text'; textInput.placeholder = '输入附加文字...';
    textInput.style.marginTop = '10px'; textInput.style.padding = '8px 12px'; textInput.style.width = '60%'; textInput.style.borderRadius = '20px';
    previewOverlay.appendChild(textInput);

    const btnWrapper = document.createElement('div'); btnWrapper.style.marginTop = '10px';
    const sendBtn = document.createElement('button'); sendBtn.textContent = '发送';
    const cancelBtn = document.createElement('button'); cancelBtn.textContent = '取消';
    btnWrapper.appendChild(sendBtn); btnWrapper.appendChild(cancelBtn);
    previewOverlay.appendChild(btnWrapper);
    document.body.appendChild(previewOverlay);

    cancelBtn.onclick = () => {
        if (inputEl) inputEl.value = '';
        document.body.removeChild(previewOverlay);
    };
    sendBtn.onclick = async () => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('sender', 'user');
        if (typeof getCurrentChatTarget === 'function') formData.append('target', getCurrentChatTarget());
        const extra_text = textInput.value.trim(); if (extra_text) formData.append('extra_text', extra_text);
        try { const res = await fetch('/oldbuddy/api/message/file', { method: 'POST', body: formData }); const data = await res.json(); if (data && data.message) appendMessage(data.message); }
        catch (e) { console.error(e); alert('文件上传失败'); }
        if (inputEl) inputEl.value = '';
        document.body.removeChild(previewOverlay);
    };
}

/** HTTPS 安全上下文下可用页面内录音（🎤 → ⏹） */
function canInlineAudioRecord() {
    return !!(window.isSecureContext
        && navigator.mediaDevices
        && navigator.mediaDevices.getUserMedia
        && typeof MediaRecorder !== 'undefined');
}

function useInlineAudioRecord() {
    return canInlineAudioRecord();
}

function pickAudioRecorderFormat() {
    const candidates = [
        { mimeType: 'audio/webm;codecs=opus', ext: 'webm' },
        { mimeType: 'audio/webm', ext: 'webm' },
        { mimeType: 'audio/mp4', ext: 'm4a' },
        { mimeType: 'audio/aac', ext: 'aac' },
    ];
    for (const c of candidates) {
        if (MediaRecorder.isTypeSupported(c.mimeType)) return c;
    }
    return { mimeType: '', ext: 'webm' };
}

async function uploadAudioBlob(blobOrFile, filename) {
    handleMediaUpload(blobOrFile, 'audio', { filename });
}

async function uploadVideoFile(file, inputEl) {
    handleMediaUpload(file, 'video', { inputEl });
}

async function initUploadHandlers() {
    document.getElementById('camera-input').onchange = (e) => handleImageFile(e.target.files[0]);
    document.getElementById('gallery-input').onchange = (e) => handleImageFile(e.target.files[0]);

    // ---------- 任意文件上传 ----------
    document.getElementById('anyfile-input').onchange = async (e) => {
        const inputEl = e.target;
        const file = inputEl.files[0];
        if (!file) return;
        await handleAnyFile(file, inputEl);
    };

    // ---------- 语音录音（HTTPS 页面内 🎤 → ⏹） ----------
    let mediaRecorder, audioChunks = [], isRecording = false, recordStream = null;
    const audioBtn = document.getElementById('send-audio');

    const videoInput = document.getElementById('video-input');
    if (videoInput) {
        videoInput.onchange = async (e) => {
            const file = e.target.files[0];
            e.target.value = '';
            if (!file) return;
            try {
                handleMediaUpload(file, 'video', { inputEl: e.target });
            } catch (err) {
                console.error(err);
                alert('视频上传失败');
            }
        };
    }

    function stopRecordStream() {
        if (recordStream) {
            recordStream.getTracks().forEach((t) => t.stop());
            recordStream = null;
        }
    }

    audioBtn.onclick = async () => {
        if (!useInlineAudioRecord()) {
            alert('当前页面非 HTTPS，无法直接录音。请使用 https:// 访问 OldBuddy。');
            return;
        }

        if (!isRecording) {
            try {
                recordStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const fmt = pickAudioRecorderFormat();
                mediaRecorder = fmt.mimeType
                    ? new MediaRecorder(recordStream, { mimeType: fmt.mimeType })
                    : new MediaRecorder(recordStream);
                audioChunks = [];
                mediaRecorder.ondataavailable = (ev) => { if (ev.data?.size) audioChunks.push(ev.data); };
                mediaRecorder.onstop = async () => {
                    stopRecordStream();
                    const mime = fmt.mimeType || mediaRecorder.mimeType || 'audio/webm';
                    const blob = new Blob(audioChunks, { type: mime });
                    try {
                        uploadAudioBlob(blob, \`record_\${Date.now()}.\${fmt.ext}\`);
                    } catch (err) {
                        console.error(err);
                        alert('录音上传失败');
                    }
                };
                mediaRecorder.start();
                isRecording = true;
                audioBtn.textContent = '⏹ 停止';
            } catch (err) {
                console.error(err);
                stopRecordStream();
                alert('无法访问麦克风，请检查浏览器权限');
            }
        } else {
            mediaRecorder.stop();
            isRecording = false;
            audioBtn.textContent = '🎤';
        }
    };

    initPasteImageHandler();
}


</script>
</body>
</html>`;
