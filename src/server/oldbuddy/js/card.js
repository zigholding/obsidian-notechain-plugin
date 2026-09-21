const SUBMITTED_CARDS_KEY = 'rochat.submittedCards';

function cssName(name) {
    const text = String(name || '');
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(text);
    return text.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function isInteractiveType(type) {
    const t = String(type || '').toLowerCase();
    return t === 'interactive' || t === 'card' || t === 'form' || t === 'ui' || t === 'interactive_card';
}

function loadSubmittedCardIds() {
    try {
        const raw = JSON.parse(localStorage.getItem(SUBMITTED_CARDS_KEY) || '[]');
        return Array.isArray(raw) ? raw.map((id) => String(id)) : [];
    } catch (e) {
        return [];
    }
}

function markCardSubmitted(id) {
    const key = String(id || '').trim();
    if (!key) return;
    const ids = loadSubmittedCardIds().filter((item) => item !== key);
    ids.push(key);
    localStorage.setItem(SUBMITTED_CARDS_KEY, JSON.stringify(ids.slice(-80)));
}

function isCardSubmitted(id) {
    const key = String(id || '').trim();
    return !!key && loadSubmittedCardIds().indexOf(key) >= 0;
}

function fieldId(field, fallback) {
    if (!field || typeof field !== 'object') return String(fallback || '');
    return String(field.id || field.name || fallback || '').trim();
}

function fieldType(field) {
    const t = String((field && field.type) || 'text').toLowerCase();
    if (t === 'input') return 'text';
    if (t === 'datetime') return 'datetime-local';
    if (t === 'slider') return 'range';
    if (t === 'autocomplete') return 'combobox';
    if (t === 'list') return 'checkbox_list';
    if (t === 'toggle') return 'switch';
    if (t === 'group' || t === 'repeat') return 'repeating';
    return t;
}

function optionPairs(options) {
    const list = Array.isArray(options) ? options : [];
    const out = [];
    for (const item of list) {
        if (typeof item === 'string' || typeof item === 'number') {
            const value = String(item);
            out.push({ value, label: value });
            continue;
        }
        if (!item || typeof item !== 'object') continue;
        const value = String(item.value != null ? item.value : item.id != null ? item.id : item.label || '').trim();
        const label = String(item.label || item.name || value);
        if (value) out.push({ value, label });
    }
    return out;
}

function defaultFieldValue(field) {
    if (!field || typeof field !== 'object') return '';
    if (field.default !== undefined) return field.default;
    if (field.value !== undefined) return field.value;
    return '';
}

function resolveInteractiveSpec(data) {
    const card = data && data.card && typeof data.card === 'object' && !Array.isArray(data.card) ? data.card : null;
    const fields = Array.isArray(card && card.fields) ? card.fields
        : (Array.isArray(data && data.fields) ? data.fields : []);
    const actions = Array.isArray(card && card.actions) ? card.actions
        : (Array.isArray(data && data.actions) ? data.actions : []);
    return {
        title: String((card && card.title) || (data && data.title) || '').trim(),
        description: String((card && (card.description || card.desc)) || (data && (data.description || data.desc)) || '').trim(),
        fields: fields.filter((row) => row && typeof row === 'object'),
        actions: actions.filter((row) => row && typeof row === 'object'),
        callbackUrl: String((data && (data.callbackUrl || data.callback || data.replyUrl))
            || (card && (card.callbackUrl || card.callback || card.replyUrl)) || '').trim(),
        reply: String((data && (data.reply || data.replyMode)) || '').trim().toLowerCase(),
    };
}

function actionIsCancel(action) {
    const id = String((action && (action.id || action.name)) || '').trim().toLowerCase();
    const style = String((action && action.style) || '').trim().toLowerCase();
    if (action && action.submit === false) return true;
    return style === 'cancel' || id === 'cancel' || id === 'skip';
}

function actionIsDanger(action) {
    const style = String((action && action.style) || '').trim().toLowerCase();
    const id = String((action && (action.id || action.name)) || '').trim().toLowerCase();
    return style === 'danger' || id === 'clear';
}

function actionShouldSubmit(action) {
    if (!action) return true;
    if (action.submit === false && actionIsDanger(action)) return false;
    return true;
}

function appendFieldLabel(wrap, field, forId) {
    const label = String((field && field.label) || '').trim();
    if (!label) return;
    const el = document.createElement('label');
    el.className = 'jiujiu-field-label';
    if (forId) el.setAttribute('for', forId);
    el.textContent = label + (field && field.required ? ' *' : '');
    wrap.appendChild(el);
}

function applyInputLimits(input, field) {
    if (!field) return;
    if (field.min != null && field.min !== '') input.min = String(field.min);
    if (field.max != null && field.max !== '') input.max = String(field.max);
    if (field.step != null && field.step !== '') input.step = String(field.step);
    if (field.placeholder) input.placeholder = String(field.placeholder);
    if (field.rows) input.rows = Number(field.rows) || 3;
}

function appendScalarInput(wrap, field, name, inputType) {
    const input = document.createElement(inputType === 'textarea' ? 'textarea' : 'input');
    const id = `f-${name}`;
    input.id = id;
    input.name = name;
    if (inputType !== 'textarea') input.type = inputType === 'combobox' ? 'text' : inputType;
    const def = defaultFieldValue(field);
    if (def !== '' && def != null && typeof def !== 'boolean') input.value = String(def);
    applyInputLimits(input, field);
    if (field && field.required) input.required = true;
    wrap.appendChild(input);
    if (inputType === 'combobox') {
        const listId = `${id}-list`;
        const list = document.createElement('datalist');
        list.id = listId;
        input.setAttribute('list', listId);
        for (const opt of optionPairs(field.options)) {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            list.appendChild(option);
        }
        wrap.appendChild(list);
    }
    if (inputType === 'range') {
        const hint = document.createElement('span');
        hint.className = 'jiujiu-range-value';
        hint.textContent = input.value;
        input.addEventListener('input', () => {
            hint.textContent = input.value;
        });
        wrap.appendChild(hint);
    }
    return input;
}

function appendChoiceGroup(wrap, field, name, multiple) {
    const box = document.createElement('div');
    box.className = multiple ? 'jiujiu-options is-multi' : 'jiujiu-options';
    const opts = optionPairs(field.options);
    const def = defaultFieldValue(field);
    const selected = new Set(
        Array.isArray(def) ? def.map((item) => String(item))
            : (def !== '' && def != null ? [String(def)] : []),
    );
    opts.forEach((opt, i) => {
        const row = document.createElement('label');
        row.className = 'jiujiu-option';
        const input = document.createElement('input');
        input.type = multiple ? 'checkbox' : 'radio';
        input.name = multiple ? `${name}[]` : name;
        input.value = opt.value;
        input.checked = selected.has(opt.value);
        const text = document.createElement('span');
        text.textContent = opt.label;
        row.appendChild(input);
        row.appendChild(text);
        box.appendChild(row);
    });
    wrap.appendChild(box);
}

function appendSelect(wrap, field, name) {
    const select = document.createElement('select');
    select.name = name;
    select.id = `f-${name}`;
    if (field.allow_empty) {
        const empty = document.createElement('option');
        empty.value = '';
        empty.textContent = String(field.empty_label || '不选');
        select.appendChild(empty);
    }
    const def = String(defaultFieldValue(field) ?? '');
    for (const opt of optionPairs(field.options)) {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        if (opt.value === def) option.selected = true;
        select.appendChild(option);
    }
    wrap.appendChild(select);
}

function appendToggle(wrap, field, name) {
    const row = document.createElement('label');
    row.className = 'jiujiu-option';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = name;
    const def = defaultFieldValue(field);
    input.checked = def === true || def === 'true' || def === 1 || def === '1';
    const text = document.createElement('span');
    text.textContent = String(field.label || (fieldType(field) === 'switch' ? '开' : '勾选'));
    row.appendChild(input);
    row.appendChild(text);
    wrap.appendChild(row);
}

function appendRepeatRow(list, field, name, index) {
    const row = document.createElement('div');
    row.className = 'jiujiu-repeat-row';
    const nested = Array.isArray(field.fields) ? field.fields : [];
    nested.forEach((child, i) => {
        appendInteractiveField(row, child, `${name}.${index}.${fieldId(child, i)}`);
    });
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'jiujiu-repeat-del';
    del.textContent = '删除';
    del.addEventListener('click', () => {
        const min = Number(field.min);
        const count = list.querySelectorAll('.jiujiu-repeat-row').length;
        if (Number.isFinite(min) && count <= min) return;
        row.remove();
    });
    row.appendChild(del);
    list.appendChild(row);
}

function appendRepeating(wrap, field, name) {
    const box = document.createElement('div');
    box.className = 'jiujiu-repeat';
    box.dataset.repeatName = name;
    const list = document.createElement('div');
    list.className = 'jiujiu-repeat-rows';
    const min = Number(field.min);
    const start = Number.isFinite(min) && min > 0 ? min : 1;
    for (let i = 0; i < start; i++) appendRepeatRow(list, field, name, i);
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'jiujiu-repeat-add';
    add.textContent = String(field.add_label || '添加');
    add.addEventListener('click', () => {
        const max = Number(field.max);
        const count = list.querySelectorAll('.jiujiu-repeat-row').length;
        if (Number.isFinite(max) && count >= max) return;
        appendRepeatRow(list, field, name, count);
    });
    box.appendChild(list);
    box.appendChild(add);
    wrap.appendChild(box);
}

function appendInteractiveField(parent, field, name) {
    const t = fieldType(field);
    const wrap = document.createElement('div');
    wrap.className = 'jiujiu-field';
    wrap.dataset.fieldId = name;
    wrap.dataset.fieldType = t;
    if (t !== 'checkbox' && t !== 'switch') appendFieldLabel(wrap, field, `f-${name}`);
    if (t === 'textarea') appendScalarInput(wrap, field, name, 'textarea');
    else if (t === 'select') appendSelect(wrap, field, name);
    else if (t === 'radio') appendChoiceGroup(wrap, field, name, false);
    else if (t === 'checkbox_list' || t === 'multiselect') appendChoiceGroup(wrap, field, name, true);
    else if (t === 'checkbox' || t === 'switch') appendToggle(wrap, field, name);
    else if (t === 'range') appendScalarInput(wrap, field, name, 'range');
    else if (t === 'repeating') appendRepeating(wrap, field, name);
    else if (t === 'combobox') appendScalarInput(wrap, field, name, 'combobox');
    else if (t === 'number' || t === 'email' || t === 'tel' || t === 'url' || t === 'date' || t === 'time' || t === 'datetime-local') {
        appendScalarInput(wrap, field, name, t);
    } else {
        appendScalarInput(wrap, field, name, 'text');
    }
    parent.appendChild(wrap);
}

function readNamedValue(root, name, type) {
    if (type === 'checkbox' || type === 'switch') {
        const el = root.querySelector(`[name="${cssName(name)}"]`);
        return !!(el && el.checked);
    }
    if (type === 'checkbox_list' || type === 'multiselect') {
        return Array.from(root.querySelectorAll(`[name="${cssName(`${name}[]`)}"]`))
            .filter((el) => el.checked)
            .map((el) => el.value);
    }
    if (type === 'radio') {
        const el = root.querySelector(`[name="${cssName(name)}"]:checked`);
        return el ? el.value : '';
    }
    if (type === 'repeating') {
        const box = root.querySelector(`[data-repeat-name="${cssName(name)}"]`);
        if (!box) return [];
        return Array.from(box.querySelectorAll(':scope > .jiujiu-repeat-rows > .jiujiu-repeat-row')).map((row) => {
            const obj = {};
            row.querySelectorAll(':scope > .jiujiu-field').forEach((child) => {
                const fid = String(child.dataset.fieldId || '').split('.').pop();
                const ft = child.dataset.fieldType;
                if (!fid) return;
                obj[fid] = readNamedValue(child, child.dataset.fieldId, ft);
            });
            return obj;
        });
    }
    const el = root.querySelector(`[name="${cssName(name)}"]`);
    if (!el) return '';
    return el.value;
}

function collectInteractiveValues(form, fields) {
    const values = {};
    fields.forEach((field, i) => {
        const id = fieldId(field, i);
        if (!id) return;
        values[id] = readNamedValue(form, id, fieldType(field));
    });
    return values;
}

function validateInteractiveValues(fields, values) {
    for (const field of fields) {
        if (!field || !field.required) continue;
        const t = fieldType(field);
        const id = fieldId(field);
        const value = values[id];
        if (t === 'checkbox' || t === 'switch') continue;
        if (t === 'checkbox_list' || t === 'multiselect' || t === 'repeating') {
            if (!Array.isArray(value) || !value.length) return `${field.label || id} 必填`;
            continue;
        }
        if (value == null || String(value).trim() === '') return `${field.label || id} 必填`;
    }
    return '';
}

function summarizeInteractiveValues(action, values) {
    const parts = [];
    if (action) parts.push(action);
    Object.keys(values || {}).forEach((key) => {
        const value = values[key];
        if (value == null || value === '') return;
        if (typeof value === 'boolean') {
            parts.push(`${key} ${value ? '是' : '否'}`);
            return;
        }
        if (Array.isArray(value)) {
            if (!value.length) return;
            parts.push(`${key} ${value.map((item) => (item && typeof item === 'object' ? JSON.stringify(item) : String(item))).join('、')}`);
            return;
        }
        parts.push(`${key} ${String(value)}`);
    });
    return parts.join(' · ') || '已提交';
}

function disableInteractiveForm(form) {
    form.classList.add('is-submitted');
    Array.from(form.querySelectorAll('input, textarea, select, button')).forEach((el) => {
        el.disabled = true;
    });
}

async function submitInteractiveResult(msg, spec, action, values) {
    const replyTo = typeof messageId === 'function' ? messageId(msg) : String((msg && (msg.msgId || msg.id)) || '');
    const actionId = String((action && (action.id || action.name)) || 'ok');
    const packet = {
        type: 'interactive_result',
        msgId: `web_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        senderId: 'user',
        target: String((msg && msg.target) || (typeof getCurrentChatTarget === 'function' ? getCurrentChatTarget() : 'local')),
        replyTo,
        action: actionId,
        result: { values, action: actionId },
        content: summarizeInteractiveValues(actionId, values),
        timestamp: Date.now(),
    };
    const res = await fetch('/oldbuddy/push_message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(packet),
    });
    if (!res.ok) throw new Error('submit failed');
    const data = await res.json();
    if (data && data.message && typeof appendMessage === 'function') {
        appendMessage(data.message);
    }
    if (spec.callbackUrl && spec.reply !== 'message') {
        try {
            await fetch(spec.callbackUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(packet),
            });
        } catch (e) {
            // 浏览器跨域时忽略，入库已经完成
        }
    }
    markCardSubmitted(replyTo);
}

function appendInteractiveCard(el, msg, data) {
    const spec = resolveInteractiveSpec(data);
    if (!spec.fields.length && !spec.actions.length) return false;
    const mid = typeof messageId === 'function' ? messageId(msg) : String((msg && (msg.msgId || msg.id)) || '');
    if (spec.title) {
        const title = document.createElement('div');
        title.className = 'jiujiu-proto-card-title';
        title.textContent = spec.title;
        el.appendChild(title);
    }
    const prompt = String((data && data.content) || (msg && msg.content) || spec.description || '').trim();
    if (prompt && prompt !== spec.title) {
        const desc = document.createElement('div');
        desc.className = 'jiujiu-proto-card-desc';
        desc.textContent = prompt;
        el.appendChild(desc);
    } else if (spec.description && spec.description !== spec.title) {
        const desc = document.createElement('div');
        desc.className = 'jiujiu-proto-card-desc';
        desc.textContent = spec.description;
        el.appendChild(desc);
    }
    const form = document.createElement('form');
    form.className = 'jiujiu-interactive';
    form.addEventListener('submit', (e) => e.preventDefault());
    spec.fields.forEach((field, i) => appendInteractiveField(form, field, fieldId(field, i)));
    const err = document.createElement('div');
    err.className = 'jiujiu-interactive-error';
    form.appendChild(err);
    const bar = document.createElement('div');
    bar.className = 'jiujiu-actions';
    const actions = spec.actions.length ? spec.actions : [{ id: 'ok', label: '确定' }];
    actions.forEach((action) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'jiujiu-action';
        if (actionIsDanger(action)) btn.classList.add('is-danger');
        if (actionIsCancel(action)) btn.classList.add('is-cancel');
        btn.textContent = String(action.label || action.id || '确定');
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            err.textContent = '';
            if (!actionShouldSubmit(action) && actionIsDanger(action)) {
                form.reset();
                return;
            }
            const values = collectInteractiveValues(form, spec.fields);
            if (!actionIsCancel(action)) {
                const problem = validateInteractiveValues(spec.fields, values);
                if (problem) {
                    err.textContent = problem;
                    return;
                }
            }
            btn.disabled = true;
            try {
                await submitInteractiveResult(msg, spec, action, values);
                disableInteractiveForm(form);
            } catch (ex) {
                err.textContent = '提交失败，请再试一次';
                btn.disabled = false;
            }
        });
        bar.appendChild(btn);
    });
    form.appendChild(bar);
    if (isCardSubmitted(mid)) disableInteractiveForm(form);
    el.appendChild(form);
    return true;
}
