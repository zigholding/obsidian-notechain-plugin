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
let DEFAULT_TARGET = 'legacy';
let targetToastTimer = null;

function normalizeSwitchText(s) {
    return (s || '').trim().toLowerCase().replace(/\s+/g, '');
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
    if (notify) showTargetToast(`已切换到：${targetTitle(target)}`);
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
    // 兼容历史消息：无 target 视作 legacy
    return 'legacy';
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
        const res = await fetch('api/targets');
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
        if (!TARGET_TITLE_MAP.legacy) {
            TARGET_TITLE_MAP.legacy = '本地';
            const opt = document.createElement('option');
            opt.value = 'legacy';
            opt.textContent = '本地';
            selectEl.appendChild(opt);
        }
        DEFAULT_TARGET = 'legacy';
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

        // 取出当前容器最顶部消息的 timestamp 作为 `before` 参数（如果存在）
        let before = null;
        const firstMsg = messagesContainer.firstElementChild;
        if (firstMsg && firstMsg.dataset && firstMsg.dataset.timestamp) {
            before = firstMsg.dataset.timestamp;
        }
        const url = before ? `api/messages?before=${encodeURIComponent(before)}&limit=${limit}` : `api/messages?limit=${limit}`;
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
 * 是否使用「卡片」式 Markdown 气泡（更宽、层次更清晰）
 * - 后端可设 msg.card === true
 * - 系统 / 调试侧消息默认按卡片展示
 */
function useMarkdownCard(msg) {
    if (msg.card === true || msg.card === "true" || msg.card === 1) return true;
    const s = msg.sender || "";
    return /^(system|debug)/.test(s);
}

/**
 * 渲染单条消息（支持 prependMessage 从旧到新加载逻辑）
 */
function renderMessage(msg) {
    const div = document.createElement('div');
    const mid = msg.id ?? (`local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
    div.className = `message ${msg.sender || ''}`;
    div.dataset.id = mid;
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
        timeDiv.textContent = `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
    }
    div.appendChild(timeDiv);

    if (msg.target) {
        const targetDiv = document.createElement('div');
        targetDiv.className = 'message-target';
        targetDiv.textContent = `对象：${targetTitle(msg.target)}`;
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
    } else if (msg.type === 'audio') {
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.src = msg.content;
        audio.className = 'message-audio';
        contentDiv.appendChild(audio);

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
            meta.textContent = `大小: ${msg.file_size} 字节`;
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

    div.appendChild(contentDiv);
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
    return messagesContainer.querySelector(`[data-id="${id}"]`);
}

/**
 * 向顶部插入消息
 */
function prependMessage(msg) {
    const id = msg.id ?? null;
    const existingNode = id ? findMessageNode(id) : null;
    const node = renderMessage(msg);

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
    const node = renderMessage(msg);

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
            `纬度: ${lat.toFixed(6)}`,
            `经度: ${lng.toFixed(6)}`,
        ];
        if (acc != null && Number.isFinite(acc)) {
            lines.push(`精度约: ±${Math.round(acc)} m`);
        }
        if (ts) {
            lines.push(`定位时间: ${new Date(ts).toISOString()}`);
        }
        const [gcjLng, gcjLat] = wgs84ToGcj02(lng, lat);
        const [bdLng, bdLat] = wgs84ToBd09(lng, lat);
        const nameQ = encodeURIComponent('当前位置');
        const osmUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
        const amapUrl = `https://uri.amap.com/marker?position=${gcjLng},${gcjLat}&name=${nameQ}`;
        const baiduUrl = `https://api.map.baidu.com/marker?location=${bdLat},${bdLng}&title=${nameQ}&content=&output=html`;
        lines.push(`[OpenStreetMap](${osmUrl})`);
        lines.push(`[高德地图](${amapUrl})`);
        lines.push(`[百度地图](${baiduUrl})`);
        return lines.join('\n');
    };

    await new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { latitude, longitude, accuracy } = pos.coords;
                const content = buildContent(latitude, longitude, accuracy, pos.timestamp);
                if (input) {
                    const prefix = input.value && input.value.trim() ? `${input.value}\n\n` : '';
                    input.value = `${prefix}${content}`;
                    // 触发 autosize 监听，保持输入框高度与内容同步。
                    input.dispatchEvent(new Event('input', { bubbles: true }));
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
                            : `定位失败：${err && err.message ? err.message : '未知错误'}`;
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

    try {
        const res = await fetch(`api/message/text`, {
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
        }
    } catch (e) {
        console.error('sendTextMessage error', e);
        alert('发送失败：网络或其他错误');
        // 将内容放回输入框（可选）
        input.value = content;
    } finally {
        // 恢复按钮
        sendBtn.disabled = false;
        sendBtn.textContent = prevBtnText;
        // 滚动由 appendMessage 负责（此处避免重复计算导致偶发不滚动）
    }
}
