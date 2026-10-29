import { App } from 'obsidian';
import { Templater } from '../easyapi/templater';
import { noteChainPlugin } from '../obsidian-app';
import type { HttpReq, HttpRes } from '../http-types';
import { errorMessage, errorStack, isRecord } from '../ts-helpers';

export class MCPToolsListService {
    constructor(
        private app: App,
        private templater: Templater,
    ) {}

    async getMCPToolsList(): Promise<unknown[]> {
        
        let listToolsFileName = 'obsidian_mcp_list_tools.md';
        let listToolsFile = noteChainPlugin(this.app)?.easyapi.file.get_tfile(listToolsFileName);

        if (listToolsFile) {
            try {
                let result = await this.templater.parse_templater(
                    listToolsFileName,
                    true,
                    {},
                    0
                );
                try {
                    let parsed = typeof result === 'string' ? JSON.parse(result.trim()) : result;
                    if (Array.isArray(parsed)) return parsed;
                    if (parsed && Array.isArray(parsed.tools)) return parsed.tools;
                    if (typeof parsed === 'object') return [parsed];
                } catch (e) {
                    console.warn('list_tools script returned invalid JSON', e);
                }
            } catch (e) {
                console.warn('obsidian_mcp_list_tools.md parse failed, using fallback', e);
            }
        }

        // 回退：从 vault 中扫描 mcp_tool frontmatter 或 mcp_ 前缀文件
        let tools: Array<{ name: string; description: unknown; inputSchema: unknown }> = [];
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
                if (isRecord(cache.frontmatter.mcp_tool) && typeof cache.frontmatter.mcp_tool.name === 'string') {
                    toolName = cache.frontmatter.mcp_tool.name;
                }
                tools.push({ name: toolName, description, inputSchema });
            }
        }

        return tools;
    }

    async handleMCPListTools(req: HttpReq, res: HttpRes) {
        try {
            let tools = await this.getMCPToolsList();
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ tools }, null, 2));
        } catch (error: unknown) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: 'Failed to list tools',
                message: errorMessage(error) || 'Unknown error',
                stack: errorStack(error)
            }));
        }
    }
}
