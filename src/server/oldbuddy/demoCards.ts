/** 演示用互动卡片，对齐啾啾 App / rochat 字段。 */

function actions(...extra: Record<string, unknown>[]): Record<string, unknown>[] {
    return [
        { id: 'ok', label: '确定' },
        { id: 'skip', label: '跳过', style: 'cancel' },
        ...extra,
    ];
}

function card(title: string, description: string, fields: Record<string, unknown>[], buttonList?: Record<string, unknown>[]): Record<string, unknown> {
    return {
        title,
        description,
        fields,
        actions: buttonList || actions(),
    };
}

export const MEAL_CARD = card(
    '晚饭',
    '选好后点确定，结果会发回这条会话。',
    [
        {
            id: 'meal',
            type: 'radio',
            label: '主食',
            options: [
                { value: 'rice', label: '米饭' },
                { value: 'noodles', label: '面条' },
            ],
            required: true,
        },
        {
            id: 'sides',
            type: 'checkbox_list',
            label: '配菜',
            options: ['青菜', '蛋', '豆腐'],
        },
        { id: 'when', type: 'time', label: '开饭时间', default: '18:30' },
        { id: 'note', type: 'textarea', label: '备注', placeholder: '选填', rows: 2 },
        { id: 'again', type: 'switch', label: '明天还吃这个' },
    ],
);

export const WIDGET_CARD = card(
    '控件一览',
    '对齐 App 目前支持的互动字段。点确定后结果会发回来。也可用 /widgets input 等只看一类。',
    [
        { id: 'when', type: 'date', label: '日期', required: true },
        {
            id: 'slot',
            type: 'select',
            label: '时段',
            options: ['早上', '中午', '晚上'],
            allow_empty: true,
            empty_label: '不选',
        },
        {
            id: 'place',
            type: 'combobox',
            label: '地点',
            options: ['家里', '公司', '食堂'],
            filterable: true,
            placeholder: '可输入',
        },
        {
            id: 'spicy',
            type: 'range',
            label: '辣度',
            min: '0',
            max: '5',
            step: '1',
            default: '2',
        },
        { id: 'notify', type: 'checkbox', label: '开饭前提醒' },
        {
            id: 'people',
            type: 'repeating',
            label: '一起吃的人',
            add_label: '加人',
            max: '3',
            fields: [
                { id: 'who', type: 'text', label: '称呼', required: true },
                { id: 'veg', type: 'switch', label: '素食' },
            ],
        },
    ],
    actions({ id: 'clear', label: '清空', style: 'danger', submit: false }),
);

const INPUT_CARD = card(
    '输入类',
    '单行、数字、联系方式和多行文本。',
    [
        { id: 'title', type: 'text', label: '标题', placeholder: '例如：买菜', required: true },
        { id: 'qty', type: 'number', label: '数量', min: '1', max: '99', default: '1' },
        { id: 'email', type: 'email', label: '邮箱', placeholder: 'you@home.lan' },
        { id: 'phone', type: 'tel', label: '电话', placeholder: '13800000000' },
        { id: 'site', type: 'url', label: '网址', placeholder: 'https://' },
        { id: 'detail', type: 'textarea', label: '说明', rows: 3, placeholder: '可多行' },
    ],
);

const DATETIME_CARD = card(
    '日期时间',
    '系统日期、时间和日期时间选择器。',
    [
        { id: 'day', type: 'date', label: '日期', required: true },
        { id: 'clock', type: 'time', label: '时间', default: '08:00' },
        { id: 'at', type: 'datetime-local', label: '开始时刻' },
    ],
);

const CHOICE_CARD = card(
    '单选与下拉',
    '芯片单选、下拉和可输入组合框。',
    [
        {
            id: 'meal',
            type: 'radio',
            label: '主食',
            options: [
                { value: 'rice', label: '米饭' },
                { value: 'noodles', label: '面条' },
            ],
            required: true,
        },
        {
            id: 'slot',
            type: 'select',
            label: '时段',
            options: ['早上', '中午', '晚上'],
            allow_empty: true,
            empty_label: '不选',
        },
        {
            id: 'place',
            type: 'combobox',
            label: '地点',
            options: ['家里', '公司', '食堂'],
            filterable: true,
            placeholder: '可输入或选',
        },
    ],
);

const LIST_CARD = card(
    '多选',
    '结果里是字符串数组，不要压成逗号。',
    [
        {
            id: 'sides',
            type: 'checkbox_list',
            label: '配菜',
            options: ['青菜', '蛋', '豆腐'],
            required: true,
        },
        {
            id: 'tags',
            type: 'multiselect',
            label: '标签',
            options: [
                { value: 'home', label: '家常' },
                { value: 'fast', label: '快手' },
            ],
        },
    ],
);

const TOGGLE_CARD = card(
    '开关与勾选',
    '结果是 true / false。',
    [
        { id: 'notify', type: 'checkbox', label: '开饭前提醒' },
        { id: 'again', type: 'switch', label: '明天还吃这个', default: true },
    ],
);

const RANGE_CARD = card(
    '滑杆',
    'min / max / step 控制刻度，结果是数字字符串。',
    [
        {
            id: 'spicy',
            type: 'range',
            label: '辣度',
            min: '0',
            max: '5',
            step: '1',
            default: '2',
        },
    ],
);

const REPEAT_CARD = card(
    '重复组',
    '可增删一行子表单，结果是对象数组。',
    [
        {
            id: 'people',
            type: 'repeating',
            label: '一起吃的人',
            add_label: '加人',
            min: '1',
            max: '4',
            required: true,
            fields: [
                { id: 'who', type: 'text', label: '称呼', required: true },
                { id: 'veg', type: 'switch', label: '素食' },
            ],
        },
    ],
);

const BUTTONS_CARD = card(
    '按钮样式',
    'cancel / danger 不校验必填；danger 为红色。',
    [{ id: 'note', type: 'text', label: '说明', required: true, placeholder: '确定时必填' }],
    [
        { id: 'ok', label: '确定' },
        { id: 'later', label: '再说', style: 'cancel', submit: false },
        { id: 'clear', label: '清空', style: 'danger', submit: false },
    ],
);

const WIDGET_SAMPLES: Record<string, Record<string, unknown>> = {
    all: WIDGET_CARD,
    input: INPUT_CARD,
    datetime: DATETIME_CARD,
    choice: CHOICE_CARD,
    list: LIST_CARD,
    toggle: TOGGLE_CARD,
    range: RANGE_CARD,
    repeat: REPEAT_CARD,
    buttons: BUTTONS_CARD,
};

const WIDGET_ALIASES: Record<string, string> = {
    '': 'all',
    gallery: 'all',
    widgets: 'all',
    date: 'datetime',
    time: 'datetime',
    select: 'choice',
    radio: 'choice',
    form: 'input',
    text: 'input',
    slider: 'range',
    group: 'repeat',
    repeating: 'repeat',
    button: 'buttons',
};

export function widgetNames(): string[] {
    return Object.keys(WIDGET_SAMPLES);
}

export function widgetSample(name: string | undefined): Record<string, unknown> | undefined {
    const raw = (name || '').trim().toLowerCase();
    const key = WIDGET_ALIASES[raw] || raw;
    return WIDGET_SAMPLES[key];
}

export function yesnoActions(): Record<string, unknown>[] {
    return [
        { id: 'yes', label: '是' },
        { id: 'no', label: '否' },
    ];
}
