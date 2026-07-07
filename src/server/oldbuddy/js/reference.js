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
    const match = before.match(/(^|[\s\u3000\n])@([^\s@\u3000\n]*)$/);
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
    picker.style.left = `${Math.max(8, rect.left)}px`;
    picker.style.width = `${Math.min(320, Math.max(200, rect.width))}px`;
    picker.style.bottom = `${window.innerHeight - barRect.top + 6}px`;
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
        row.innerHTML = formatPickerRowHtml(item.label, item.text);
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

function normalizePickerText(s, stripHash = false) {
    let x = String(s || '').trim();
    if (stripHash) x = x.replace(/^#+/, '');
    return x;
}

/** label 与 text 语义相同时视为相同（忽略首尾 #、空白） */
function pickerTextsEquivalent(a, b, stripHash = false) {
    return normalizePickerText(a, stripHash) === normalizePickerText(b, stripHash);
}

function formatPickerRowHtml(primary, secondary, stripHash = false) {
    const main = escapeHtml(primary);
    const sub =
        secondary && !pickerTextsEquivalent(primary, secondary, stripHash)
            ? `<span class="reference-picker-sub">${escapeHtml(secondary)}</span>`
            : '';
    return `<span class="reference-picker-label">${main}</span>${sub}`;
}

function formatReferenceInsert(item) {
    const raw = String(item.text || '').trim();
    if (!raw) return '@';
    return raw.startsWith('@') ? raw : `@${raw}`;
}

function applyReferenceItem(item) {
    const input = document.getElementById('text-input');
    if (!input || !referenceMentionRange) return;
    const insert = `${formatReferenceInsert(item)} `;
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
    const url = `/oldbuddy/api/reference?target=${encodeURIComponent(target)}&query=${encodeURIComponent(query || '')}`;
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
