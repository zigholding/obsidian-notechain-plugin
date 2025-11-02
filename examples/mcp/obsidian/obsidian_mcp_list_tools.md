---
words:
  2025-11-02: 141
---

```js //templater

// 获取所有 MCP 工具
let tools = [];
let tfiles = app.vault.getMarkdownFiles();

for (let file of tfiles) {
    let cache = app.metadataCache.getFileCache(file);
    if (!cache) continue;
    
    // 检查 frontmatter 中的 mcp_tool 标记
    if (cache.frontmatter && cache.frontmatter.mcp_tool) {
        let toolName = file.basename;
        let description = cache.frontmatter.description || '';
        let inputSchema = cache.frontmatter.inputSchema || {
            type: 'object',
            properties: {},
            required: []
        };
        
        // 如果 frontmatter 中有自定义名称
        if (cache.frontmatter.mcp_tool.name) {
            toolName = cache.frontmatter.mcp_tool.name;
        }
        
        tools.push({
            name: toolName,
            description: description,
            inputSchema: inputSchema
        });
    }
    
    // 或者检查文件名前缀
    if (file.basename.startsWith('mcp_') && 
        !file.basename.includes('list_tools')) {
        tools.push({
            name: file.basename,
            description: `工具: ${file.basename}`,
            inputSchema: {
                type: 'object',
                properties: {},
                required: []
            }
        });
    }
}

// 返回 MCP 标准格式
tR += JSON.stringify(tools, null, 2);
```

