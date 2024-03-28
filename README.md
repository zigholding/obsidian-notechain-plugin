# Obsidian Zigholding Plugin



这个插件基于 [Obsidian Sample Plugin](https://github.com/obsidianmd/obsidian-sample-plugin) 修改，你可以在该项目中查看基础信息。



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





