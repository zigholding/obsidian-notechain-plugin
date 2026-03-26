# cmd_chat_with_target_tfile 用法

`cmd_chat_with_target_tfile(tfile: TFile | null = null, target: any = null)` 是 `WebViewerLLMModule` 里用于组装提示词并向当前激活 LLM 发起请求的核心方法。

## 1. 参数说明

- `tfile`
  - `TFile`：把该文件当作提示词模板来源（`get_prompt(tfile)`）。
  - `string`：直接把这个字符串当作 `prompt` 使用；随后内部会把 `tfile` 重置为当前文件 `ea.cfile`。
  - `null`：弹出卡片选择器，从 `settings.webviewllm.prompt_name` 对应标签筛选的笔记中选；如果当前有选中文本，还会出现“选择文本”入口。
- `target`
  - `string`：把剩余的 `${...}` 占位符全部替换成这个字符串（全局替换）。
  - `array`：按顺序逐个替换剩余 `${...}`（每次只替换一个）。
  - `object`：按键名替换对应占位符，例：`{ name: "A" }` -> `${name}`。

## 2. 执行流程（按顺序）

1. 获取最后激活的 LLM：`get_last_active_llm()`。
2. 决定 `prompt` 来源（见参数 `tfile`）。
3. 删除模板最前面的注释块：`%% ... %%`。
4. 处理条件占位符：`${selection?fallback}`  
   - 有选中文本时 -> `${selection}`  
   - 无选中文本时 -> `${fallback}`
5. 构建内置替换项并替换：
   - `${selection}`（有选中时）
   - `${tfile.basename}`
   - `${tfile.path}`
   - `${tfile.content}`（当前文件去 metadata 后内容）
   - `${tfile.brothers}`（同级兄弟文件 basenames 列表）
   - `${tfile}`（`Name + Path + 当前全文`）
6. 若模板仍包含 `${selection}` 且当前无选中，提示 `请选择文本/Select text first` 并终止。
7. 处理 `${[[Some Note]]}`：读取对应笔记并执行 `parse_templater` 后替换。
8. 处理 `${prompt.xxx}`：逐个弹输入框收集值后替换；`xxx=selection` 时默认值为当前选择文本。
9. 应用 `target` 参数替换（若传入）。
10. 若开启 `settings.webviewllm.add_reference` 且 `tfile` 为 `TFile`：弹多选参考笔记并拼接到 `prompt` 末尾。
11. 运行 `preprocess`：把设置里的每行文件名当模板执行，输出覆盖 `prompt`。
12. 若开启 `write_clipboard`：把最终 `prompt` 写入剪贴板。
13. 若存在 LLM：发送请求 `llm.request(prompt)` 得到 `response`。
14. 判断目标模板是否含 `js //templater` 代码块：
   - 不含且有 `response`：仅切换到 LLM 视图。
   - 含：执行 `ea.tpl.parse_templater(tfile, true, { tfile, cfile, prompt, response, llm })`。
15. 运行 `postprocess`：按设置逐个模板执行（可使用 `prompt/response/llm` 等上下文）。

## 3. 支持的占位符

- 内置：
  - `${selection}`
  - `${tfile.basename}`
  - `${tfile.path}`
  - `${tfile.content}`
  - `${tfile.brothers}`
  - `${tfile}`
- 条件：
  - `${selection?fallback}`（当前仅对 `selection` 主条件做特殊处理）
- 引用笔记：
  - `${[[笔记名或路径]]}`
- 交互输入：
  - `${prompt.xxx}`

## 4. 参考笔记拼接格式

当启用参考笔记并完成选择后，会在 `prompt` 末尾追加结构化块（用于降低与正文标题冲突）：

- 开始/结束标记：`<<NC_REF|BEGIN>>` / `<<NC_REF|END>>`
- 每篇笔记包裹：
  - `<<NC_REF|DOC>>`
  - `name: ...`
  - `path: ...`
  - 正文（去 metadata）
  - `<<NC_REF|/DOC>>`

## 5. 使用示例

```ts
// 1) 让用户选择模板笔记（或“选择文本”），然后直接发给 LLM
await module.cmd_chat_with_target_tfile();

// 2) 指定模板文件
await module.cmd_chat_with_target_tfile(templateTFile);

// 3) 直接传原始 prompt 字符串
await module.cmd_chat_with_target_tfile("请总结：${tfile.content}");

// 4) 统一替换所有剩余占位符
await module.cmd_chat_with_target_tfile(templateTFile, "Alice");

// 5) 按顺序替换占位符
await module.cmd_chat_with_target_tfile(templateTFile, ["Alice", "Project X"]);

// 6) 按键名替换占位符
await module.cmd_chat_with_target_tfile(templateTFile, { name: "Alice", project: "Project X" });
```

## 6. 注意点

- `target` 的 `string/array` 分支会匹配 `${.*?}`，范围较宽，可能替换掉你不希望替换的占位符。
- 占位符替换先于 `preprocess`；`preprocess` 会整体重写 `prompt`。
- `object` 分支当前使用 `prompt.replace` 的单次替换（非全局）。
- 当 `llm` 不存在时，不会发送请求，但前置流程（含 preprocess）仍会执行。

## 7. 面向用户配置（实操）

以下配置位于 `settings.webviewllm`。

- `prompt_name`
  - 含义：按“标签”筛选可选提示词笔记（多行，一行一个 tag）。
  - 触发时机：`cmd_chat_with_target_tfile()` 且未传 `tfile` 时。
  - 示例：
    ```text
    prompt
    llm-template
    ```

- `add_reference`
  - 含义：是否在发送前弹窗选择“参考笔记”并追加到 prompt。
  - 额外控制：模板笔记 frontmatter 的 `reference` 字段。
    - `link`：模板笔记链接 + 当前笔记链接（合并去重）
    - `folder`：模板所在目录全部文件（按 chain 排序）
    - `all`：库内所有笔记
    - 其他字符串：按 `ea.file.get_group(reference)` 取组
  - 推荐：默认用 `link`，上下文干净、成本可控。

- `preprocess`
  - 含义：发送 LLM 前的“最终改写器”列表（多行，一行一个模板文件名/路径）。
  - 行为：按顺序执行 templater，后一个输出覆盖前一个输出，最终覆盖 `prompt`。
  - 可用上下文：`{ tfile, cfile, prompt }`。
  - 推荐：只放 1-2 个稳定模板，避免链路过深导致难排错。

- `postprocess`
  - 含义：拿到 `response` 后执行的后处理模板列表（多行）。
  - 行为：顺序执行，不会回写到 `prompt`，通常用于落盘、摘录、二次分发。
  - 可用上下文：`{ tfile, cfile, prompt, response, llm }`。

- `write_clipboard`
  - 含义：是否把最终发给 LLM 的 prompt 同步到系统剪贴板。
  - 建议：调试模板时开启，稳定后可关闭。

## 8. 推荐模板片段

### 8.1 基础聊天模板

```md
请基于以下笔记内容回答：

${tfile.content}
```

### 8.2 带“可选选区”的模板

```md
任务：总结当前笔记要点。
若用户有选区，优先总结选区；否则总结全文。

${selection?tfile.content}
```

### 8.3 交互补参模板

```md
你是我的写作助手。
主题：${prompt.topic}
风格：${prompt.style}
素材：
${tfile.content}
```

### 8.4 引用其他笔记模板

```md
主任务：
请回答这个问题：${prompt.question}

补充上下文：
${[[知识库/术语表]]}
${[[项目/背景说明]]}
```

## 9. 调试建议

- 先用最小模板验证：仅 `${tfile.content}`，排除其它变量干扰。
- 开启 `write_clipboard`，直接查看“最终 prompt”是否符合预期。
- 若结果异常，优先检查替换顺序：内置占位符 -> `${prompt.xxx}` -> `target` -> `preprocess`。
- `preprocess/postprocess` 出问题时，先注释到只保留一个模板逐步恢复。
