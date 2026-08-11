> 思想如流水，笔记如链条。在文件列表中按链排序与层级缩进，提供 MCP / EasyAPI，并在 Web Viewer 中自动化 AI 对话。

![Obsidian Downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&color=%23483699&label=下载次数&query=$["note-chain"].downloads&url=https://raw.githubusercontent.com/obsidianmd/obsidian-releases%2Fmaster/community-plugin-stats.json)

## 为什么是 `Note Chain`

现代笔记提出的双链概念，让笔记像大脑一样，网状思考。像根系或河网一样星罗密布，不遗漏任何想法，根据笔记内在链接，我们又轻而易举地将每个想法拾起。

但是，当我们最终决定将观点整理成文章，想主题汇编成书籍时，我们不得不将这张网卷成一条主线。那为什么不一开始就为此做出一点努力呢？

当我像 `尼古拉斯·鲍曼` 一样，盯着蛮抽屉的笔记时，各类的抽屉、各种的笔记，标题、内容、标签、参考和日期在我脑中闪烁，我意识到：

> 线性输出需要线性输入。

![image](./assets/Pasted%20image%2020240727203225.png)

为此，我将所有按顺序排列的笔记称为笔记链，并开发了 `Note Chain` 插件，旨在为笔记管理这张拼图，添上一小块。

## 功能文档

| 文档 | 说明 |
|------|------|
| [[NoteChain 创建笔记链]] | `PrevNote` / `NextNote`、创建与插入节点、整夹重塑、与 `LongForm` 联动 |
| [[NoteChain 层级缩进]] | `notechain.level` 与 Confluence 风格缩进快捷键 |
| [[NoteChain 文件列表排序]] | 按链排序、拖拽、文件夹锚点、显示名与样式、canvas 规则 |
| [[NoteChain 快速访问]] | 打开 / 定位 / 前后置跳转及其它实用命令 |
| [[NoteChain Textarea]] | 笔记内交互面板；详见 [[Textarea 完整使用指南]] |
| [[NoteChain HTTP 服务器]] | 桌面本地 HTTP/HTTPS；挂载 MCP、Online、OldBuddy |
| [[MCP服务使用说明]] | 将脚本笔记暴露为 MCP 工具；另见 [[使用 NoteChain HttpServer 将脚本笔记变为 MCP 工具]] |
| [[NoteChain Online 库]] | 浏览器读写库内 Markdown |
| [[OldBuddy]] | 本地聊天伴侣（`/oldbuddy`） |
| [[NoteChain WebViewer LLM]] | Web Viewer 中自动化 AI 对话；详见 [[WebViewLLM]] |
| [[NoteChain 其它功能]] | 设置项、字数统计、[[EasyApi]] |
| [[NoteChain 安装]] | 依赖与安装方式 |

相关专题：[[NoteChain 右键命令]] · [[NoteChain 可视化笔记]] · [[NoteChain 和 LongForm的超强联动]] · [[NoteChain 关系]]

