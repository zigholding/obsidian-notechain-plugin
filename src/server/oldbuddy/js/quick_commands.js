// static/js/quick_commands.js
let quickCmdMenu = null;
let lastQuickCommands = [];
let slashMenu = null;
let slashOpen = false;
let slashItems = [];
let slashHighlight = 0;

const SLASH_BUILTINS = [
    { id: 'slash-card', label: '/card 晚饭示例', text: '/card', needsArg: false },
    { id: 'slash-yesno', label: '/yesno 是或否', text: '/yesno', needsArg: true },
    { id: 'slash-widgets', label: '/widgets 控件', text: '/widgets', needsArg: true },
    { id: 'slash-web', label: '/web 查词', text: '/web', needsArg: true },
];

function getQuickCommandTarget() {
    return (typeof getCurrentChatTarget === "function")
        ? getCurrentChatTarget()
        : "local";
}

async function loadQuickCommandsForTarget(target) {
    const url = `/oldbuddy/api/quick_commands?target=${encodeURIComponent(target || "local")}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("获取快捷命令失败");
    const data = await res.json();
    return data.commands ?? [];
}

function renderQuickCommandButtons(menu, cmds) {
    menu.replaceChildren();
    cmds.forEach(cmd => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = cmd.label;
        btn.dataset.cmdId = cmd.id;
        btn.dataset.cmdText = cmd.text;
        btn.onclick = async (e) => {
            e.stopPropagation();
            menu.classList.remove("is-open");
            await sendQuickCommand(btn.dataset.cmdText, btn.dataset.cmdId);
        };
        menu.appendChild(btn);
    });
}

async function refreshQuickCommandMenu(target) {
    const tid = target || getQuickCommandTarget();
    try {
        lastQuickCommands = await loadQuickCommandsForTarget(tid);
        if (quickCmdMenu) renderQuickCommandButtons(quickCmdMenu, lastQuickCommands);
        if (slashOpen) renderSlashPalette();
    } catch (err) {
        lastQuickCommands = [];
        if (quickCmdMenu) quickCmdMenu.replaceChildren();
    }
}

function isSlashPaletteOpen() {
    return slashOpen;
}

function hideSlashPalette() {
    slashOpen = false;
    slashHighlight = 0;
    slashItems = [];
    if (slashMenu) {
        slashMenu.classList.remove('is-open');
        slashMenu.replaceChildren();
    }
}

function slashCatalog() {
    const cmds = (lastQuickCommands || []).map((cmd, i) => ({
        id: String(cmd.id || `qc-${i}`),
        label: String(cmd.label || cmd.text || ''),
        text: String(cmd.text || ''),
        needsArg: false,
        cmdId: cmd.id || '',
    })).filter((item) => item.text);
    return [...SLASH_BUILTINS, ...cmds];
}

function filterSlashItems(query) {
    const q = String(query || '');
    const rest = q.startsWith('/') ? q.slice(1).trim().toLowerCase() : q.trim().toLowerCase();
    const all = slashCatalog();
    if (!rest) return all;
    return all.filter((item) => {
        const text = item.text.toLowerCase();
        const label = item.label.toLowerCase();
        return text.startsWith(q.toLowerCase())
            || text.startsWith(rest)
            || label.indexOf(rest) >= 0;
    });
}

function renderSlashPalette() {
    const input = document.getElementById('text-input');
    if (!slashMenu || !input) return;
    const typed = input.value;
    if (!typed.startsWith('/')) {
        hideSlashPalette();
        return;
    }
    const items = filterSlashItems(typed);
    slashItems = items;
    slashMenu.replaceChildren();
    if (!items.length) {
        hideSlashPalette();
        return;
    }
    if (slashHighlight >= items.length) slashHighlight = items.length - 1;
    items.forEach((item, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ob-slash-item';
        if (idx === slashHighlight) btn.classList.add('is-active');
        btn.setAttribute('role', 'option');
        const label = document.createElement('span');
        label.className = 'ob-slash-item-label';
        label.textContent = item.label;
        const hint = document.createElement('span');
        hint.className = 'ob-slash-item-hint';
        hint.textContent = item.text;
        btn.appendChild(label);
        if (item.text && item.text !== item.label) btn.appendChild(hint);
        btn.addEventListener('mousedown', (e) => e.preventDefault());
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            applySlashItem(item);
        });
        slashMenu.appendChild(btn);
    });
    slashOpen = true;
    slashMenu.classList.add('is-open');
}

function moveSlashHighlight(delta) {
    if (!slashItems.length) return;
    slashHighlight = (slashHighlight + delta + slashItems.length) % slashItems.length;
    const rows = slashMenu ? slashMenu.querySelectorAll('.ob-slash-item') : [];
    rows.forEach((row, i) => {
        if (i === slashHighlight) row.classList.add('is-active');
        else row.classList.remove('is-active');
    });
    const active = rows[slashHighlight];
    if (active && typeof active.scrollIntoView === 'function') {
        active.scrollIntoView({ block: 'nearest' });
    }
}

async function applySlashItem(item) {
    const input = document.getElementById('text-input');
    if (!input || !item) return;
    const typed = input.value.trim();
    const hasArgs = typed.length > item.text.length && typed.toLowerCase().startsWith(item.text.toLowerCase());
    hideSlashPalette();
    if (hasArgs) {
        input.value = typed;
        if (typeof sendTextMessage === 'function') await sendTextMessage();
        else await sendQuickCommand(typed, item.cmdId || null);
        return;
    }
    if (item.needsArg) {
        input.value = item.text + ' ';
        if (typeof autosizeTextInput === 'function') autosizeTextInput(input);
        input.focus();
        return;
    }
    if (item.cmdId) {
        input.value = '';
        if (typeof autosizeTextInput === 'function') autosizeTextInput(input);
        await sendQuickCommand(item.text, item.cmdId);
        return;
    }
    input.value = item.text;
    if (typeof sendTextMessage === 'function') await sendTextMessage();
    else await sendQuickCommand(item.text, null);
}

function initSlashPalette() {
    slashMenu = document.getElementById('slash-cmd-menu');
    const input = document.getElementById('text-input');
    if (!slashMenu || !input) return;
    input.addEventListener('input', () => {
        if (input.value.startsWith('/')) renderSlashPalette();
        else hideSlashPalette();
    });
    input.addEventListener('keydown', (e) => {
        if (!slashOpen) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            e.stopImmediatePropagation();
            moveSlashHighlight(1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            e.stopImmediatePropagation();
            moveSlashHighlight(-1);
        } else if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const item = slashItems[slashHighlight];
            if (item) applySlashItem(item);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopImmediatePropagation();
            hideSlashPalette();
        } else if (e.key === 'Tab') {
            e.preventDefault();
            e.stopImmediatePropagation();
            const item = slashItems[slashHighlight];
            if (item) {
                input.value = item.needsArg ? item.text + ' ' : item.text;
                if (typeof autosizeTextInput === 'function') autosizeTextInput(input);
                if (item.needsArg) renderSlashPalette();
                else hideSlashPalette();
            }
        }
    }, true);
}

async function createQuickCommandUI() {
    const statusBar = document.getElementById("status-bar");
    const quickBtn = document.createElement("button");
    quickBtn.id = "quick-cmd-btn";
    quickBtn.type = "button";
    quickBtn.title = "快捷命令";
    quickBtn.textContent = "⚡";
    const statusDot = document.getElementById("status-dot");
    statusBar.insertBefore(quickBtn, statusDot);

    const menu = document.createElement("div");
    menu.id = "quick-cmd-menu";
    menu.className = "ob-quick-cmd-menu";
    document.body.appendChild(menu);
    quickCmdMenu = menu;

    await refreshQuickCommandMenu(getQuickCommandTarget());
    initSlashPalette();

    quickBtn.onclick = (e) => {
        e.stopPropagation();
        menu.classList.toggle("is-open");
    };

    document.addEventListener("click", () => { menu.classList.remove("is-open"); });
    menu.addEventListener("click", (e) => e.stopPropagation());
}

async function sendQuickCommand(text, cmdId = null) {
    if (!text) return;
    hideSlashPalette();
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
        const input = document.getElementById('text-input');
        if (input && !input.value) {
            input.value = text;
            if (typeof autosizeTextInput === 'function') autosizeTextInput(input);
        }
    }
}
