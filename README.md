# Obsidian Zigholding Plugin



Why this plugin? 

Thought as River，Notes as Chain!





为什么做这个插件？

随着卡片盒笔记的深入使用，我认为其核心是：线性的输入，需要线性的输出。我需要一个插件，像链条一样，串起所有的笔记。补上笔记管理世界的一块小拼图。



## 如何使用

与 `Obsidian Sample Plugin` 一样，你可以下载项目到你的 Obsidian 中编译使用。

```bash
cd Your_Vault_DIR/.obsidian/plugins
git clone https://github.com/obsidianmd/obsidian-sample-plugin.git
cd obsidian-sample-plugin
npm i # 下载依赖包
npm run dev # 将 main.ts 编译为 main.js
```

这是一个开发项目，`.gitignore` 中默认注释了 `data.json` 和 `main.js`。但我取消了注释，方便下载即项目即可使用。你可以 `.gitignore` 中重要设置为忽略。

```text
# Don't include the compiled main.js file in the repo.
# They should be uploaded to GitHub releases instead.
# main.js

# obsidian
# data.json
```

这是我的个人项目，请确保你知道你正在对你的笔记库做什么。

当然，有些危险的操作我会提示你。



正则表达式替换：

```
要替换的正则表达式：\[\[2024-03-29\]\]
目标字符串：2024-03-29
效果：将 [[2024-03-29]]替换成 2024-03-29

要替换的正则表达式：\[\[2024-03-29\|?.*\]\]
目标字符串：2024-03-29
效果：将 [[2024-03-29|today]]替换成 2024-03-29
```

