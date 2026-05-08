import { App } from 'obsidian';
import { Templater } from '../easyapi/templater';

export class MCPToolsListService {
    constructor(
        private app: App,
        private templater: Templater,
    ) {}

    async getMCPToolsList(): Promise<any[]> {
        
        let listToolsFileName = 'obsidian_mcp_list_tools.md';
        let listToolsFile = (this.app as any).plugins.getPlugin('note-chain').easyapi.file.get_tfile(listToolsFileName);

        if (listToolsFile) {
            try {
                let result = await this.templater.parse_templater(
                    listToolsFileName,
                    true,
                    null,
                    null,
                    ''
                );
                if (result && result.length > 0) {
                    let resultStr = result.join('\n').trim();
                    try {
                        let parsed = JSON.parse(resultStr);
                        if (Array.isArray(parsed)) return parsed;
                        if (parsed && Array.isArray(parsed.tools)) return parsed.tools;
                        if (typeof parsed === 'object') return [parsed];
                    } catch {
                        console.warn('list_tools script returned invalid JSON');
                    }
                }
            } catch (e) {
                console.warn('obsidian_mcp_list_tools.md parse failed, using fallback', e);
            }
        }

        // 回退：从 vault 中扫描 mcp_tool frontmatter 或 mcp_ 前缀文件
        let tools: any[] = [];
        let tfiles = this.app.vault.getMarkdownFiles();

        for (let file of tfiles) {
            let cache = this.app.metadataCache.getFileCache(file);
            if (!cache) continue;

            if (cache.frontmatter && cache.frontmatter.mcp_tool) {
                let toolName = file.basename;
                let description = cache.frontmatter.description || '';
                let inputSchema = cache.frontmatter.inputSchema || {
                    type: 'object',
                    properties: {},
                    required: []
                };
                if (cache.frontmatter.mcp_tool && (cache.frontmatter.mcp_tool as any).name) {
                    toolName = (cache.frontmatter.mcp_tool as any).name;
                }
                tools.push({ name: toolName, description, inputSchema });
            }

            if (file.basename.startsWith('mcp_') && !file.basename.includes('list_tools')) {
                tools.push({
                    name: file.basename,
                    description: `工具: ${file.basename}`,
                    inputSchema: { type: 'object', properties: {}, required: [] }
                });
            }
        }

        return tools;
    }

    async handleMCPListTools(req: any, res: any) {
        try {
            let tools = await this.getMCPToolsList();
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ tools }, null, 2));
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: 'Failed to list tools',
                message: error.message || 'Unknown error',
                stack: error.stack
            }));
        }
    }
}
