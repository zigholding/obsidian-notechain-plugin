// static/js/tags.js — 输入 # 时浮层选择标签（nochain_oldbuddy_tags）

let tagPicker = null;
let tagPickerOpen = false;
let tagItems = [];
let tagHighlight = 0;
let tagFetchTimer = null;
let tagMentionRange = null;

function isTagPickerOpen() {
    return tagPickerOpen;
}

function getTagTarget() {
    return typeof getCurrentChatTarget === 'function' ? getCurrentChatTarget() : 'local';
}

/** 光标前正在输入的 # 片段；无则 null */
function getActiveTagMention(input) {
    if (!input) return null;
    const pos = input.selectionStart;
    if (pos == null) return null;
    const before = input.value.slice(0, pos);
    const match = before.match(/(^|[\s\u3000\n])#([^\s#\u3000\n]*)$/);
    if (!match) return null;
    const query = match[2] || '';
    const start = pos - query.length - 1;
    return { query, start, end: pos };
}

function ensureTagPicker() {
    if (tagPicker) return tagPicker;
    const el = document.createElement('div');
    el.id = 'tag-picker';
    el.setAttribute('role', 'listbox');
    el.style.display = 'none';
    document.body.appendChild(el);
    tagPicker = el;
    return el;
}

function positionTagPicker(input) {
    const picker = ensureTagPicker();
    const inputBar = document.getElementById('input-bar');
    const rect = input.getBoundingClientRect();
    const barRect = inputBar ? inputBar.getBoundingClientRect() : rect;
    picker.style.left = `${Math.max(8, rect.left)}px`;
    picker.style.width = `${Math.min(320, Math.max(200, rect.width))}px`;
    picker.style.bottom = `${window.innerHeight - barRect.top + 6}px`;
}

function hideTagPicker() {
    tagPickerOpen = false;
    tagMentionRange = null;
    tagHighlight = 0;
    if (tagPicker) {
        tagPicker.style.display = 'none';
        tagPicker.innerHTML = '';
    }
}

function renderTagPicker(items) {
    const picker = ensureTagPicker();
    picker.innerHTML = '';
    tagItems = items;
    tagHighlight = 0;

    if (!items.length) {
        hideTagPicker();
        return;
    }

    items.forEach((item, idx) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'reference-picker-item';
        row.setAttribute('role', 'option');
        row.dataset.index = String(idx);
        row.innerHTML = formatPickerRowHtml(formatTagLabel(item), item.text, true);
        row.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            applyTagItem(item);
        };
        picker.appendChild(row);
    });

    updateTagHighlight();
    picker.style.display = 'block';
    tagPickerOpen = true;
}

function formatTagLabel(item) {
    const raw = item.label || item.text || '';
    return raw.startsWith('#') ? raw : `#${raw}`;
}

function formatTagInsert(item) {
    const raw = String(item.text || '').trim();
    if (!raw) return '#';
    return raw.startsWith('#') ? raw : `#${raw}`;
}

function updateTagHighlight() {
    if (!tagPicker) return;
    const rows = tagPicker.querySelectorAll('.reference-picker-item');
    rows.forEach((row, i) => {
        row.classList.toggle('active', i === tagHighlight);
    });
    const active = rows[tagHighlight];
    if (active && typeof active.scrollIntoView === 'function') {
        active.scrollIntoView({ block: 'nearest' });
    }
}

function applyTagItem(item) {
    const input = document.getElementById('text-input');
    if (!input || !tagMentionRange) return;
    const insert = `${formatTagInsert(item)} `;
    const val = input.value;
    const { start, end } = tagMentionRange;
    input.value = val.slice(0, start) + insert + val.slice(end);
    const newPos = start + insert.length;
    input.setSelectionRange(newPos, newPos);
    if (typeof autosizeTextInput === 'function') {
        autosizeTextInput(input);
    }
    hideTagPicker();
    input.focus();
}

async function fetchTags(query) {
    const target = getTagTarget();
    const url = `/oldbuddy/api/tags?target=${encodeURIComponent(target)}&query=${encodeURIComponent(query || '')}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.tags) ? data.tags : [];
}

function scheduleTagFetch(input, mention) {
    if (tagFetchTimer) clearTimeout(tagFetchTimer);
    tagMentionRange = { start: mention.start, end: mention.end, query: mention.query };
    tagFetchTimer = setTimeout(async () => {
        tagFetchTimer = null;
        const inputNow = document.getElementById('text-input');
        if (!inputNow) return;
        const active = getActiveTagMention(inputNow);
        if (!active) {
            hideTagPicker();
            return;
        }
        tagMentionRange = { start: active.start, end: active.end, query: active.query };
        positionTagPicker(inputNow);
        try {
            const items = await fetchTags(active.query);
            if (!getActiveTagMention(inputNow)) {
                hideTagPicker();
                return;
            }
            renderTagPicker(items);
        } catch (e) {
            console.warn('[tags] fetch failed', e);
            hideTagPicker();
        }
    }, 120);
}

function onTagInput() {
    const input = document.getElementById('text-input');
    if (!input) return;
    const mention = getActiveTagMention(input);
    if (!mention) {
        hideTagPicker();
        return;
    }
    positionTagPicker(input);
    scheduleTagFetch(input, mention);
}

function onTagKeydown(e) {
    if (!tagPickerOpen || !tagItems.length) return false;
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        tagHighlight = (tagHighlight + 1) % tagItems.length;
        updateTagHighlight();
        return true;
    }
    if (e.key === 'ArrowUp') {
        e.preventDefault();
        tagHighlight = (tagHighlight - 1 + tagItems.length) % tagItems.length;
        updateTagHighlight();
        return true;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        const item = tagItems[tagHighlight];
        if (item) applyTagItem(item);
        return true;
    }
    if (e.key === 'Escape') {
        e.preventDefault();
        hideTagPicker();
        return true;
    }
    return false;
}

function initTagPicker() {
    const input = document.getElementById('text-input');
    if (!input) return;

    input.addEventListener('input', onTagInput);
    input.addEventListener('click', onTagInput);
    input.addEventListener('keyup', onTagInput);
    input.addEventListener('keydown', (e) => {
        if (onTagKeydown(e)) return;
    }, true);

    document.addEventListener('click', (e) => {
        if (!tagPickerOpen) return;
        if (tagPicker && tagPicker.contains(e.target)) return;
        if (e.target === input) return;
        hideTagPicker();
    });

    window.addEventListener('resize', () => {
        if (tagPickerOpen && input) positionTagPicker(input);
    });
}
