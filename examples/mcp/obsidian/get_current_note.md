---
PrevNote: "[[obsidian_mcp_list_tools]]"
NextNote: "[[create_note]]"
mcp_tool: true
description: 获取当前打开的笔记信息
inputSchema:
  properties: {}
  required: []
words:
  2025-11-02: 42
---


```js //templater
let currentFile = ea.cfile;
let result = {
    type: 'text',
    text: JSON.stringify({
        path: currentFile.path,
        name: currentFile.name,
        basename: currentFile.basename,
        size: currentFile.stat.size,
        mtime: new Date(currentFile.stat.mtime).toISOString()
    }, null, 2)
};
console.log(result)
tR += JSON.stringify(result);
```