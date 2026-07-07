import { MCP_TEST_HTML } from './mcpTestPageHtml';
import type { MCPToolsListService } from './mcpToolsList';

export class MCPSkillAndTestPages {
    constructor(
        private tools: MCPToolsListService,
        private getPort: () => number,
    ) {}

    /** 提供 MCP call_tool 测试页面，浏览器访问 /mcp/test 即可 */
    async handleMCPTestPage(req: any, res: any) {
        const host = req.headers.host || `127.0.0.1:${this.getPort()}`;
        const baseUrl = `https://${host}`;
        const html = MCP_TEST_HTML.replace('__BASE_URL__', baseUrl);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
    }

    /**
     * 生成供 Agent 使用的 MCP Skill 文档（SKILL.md 内容）。
     * @param baseUrl 例如 https://127.0.0.1:3000
     * @param tools 可选，当前支持的工具列表；传入时会生成表格并写入「先用表格、不够再 list_tools、找不到则告知无法完成」的流程说明
     */
    getMCPSkillMarkdown(baseUrl: string, tools?: any[]): string {
        const base = baseUrl.replace(/\/$/, '');
        const toolsTable =
            tools && tools.length > 0
                ? `
## Currently supported tools (at skill generation time)

| Name | Description | inputSchema |
|------|-------------|-------------|
${tools.map((t) => {
            const name = (t.name ?? '').replace(/\|/g, '\\|');
            const desc = (t.description ?? '').replace(/\n/g, ' ').replace(/\|/g, '\\|').trim();
            const schemaStr = typeof t.inputSchema === 'object'
                ? JSON.stringify(t.inputSchema).replace(/\n/g, ' ').replace(/\|/g, '\\|')
                : (t.inputSchema ?? '{}').replace(/\n/g, ' ').replace(/\|/g, '\\|');
            return `| ${name} | ${desc || '-'} | \`${schemaStr}\` |`;
        }).join('\n')}

### Full tool definitions (name, description, inputSchema)

${tools.map((t) => {
            const name = t.name ?? '';
            const desc = t.description ?? '';
            const schema = t.inputSchema != null ? (typeof t.inputSchema === 'object' ? JSON.stringify(t.inputSchema, null, 2) : String(t.inputSchema)) : '{}';
            return `**${name}**\n- Description: ${desc || '-'}\n- inputSchema:\n\`\`\`json\n${schema}\n\`\`\``;
        }).join('\n\n')}

**Workflow:**
1. Prefer the tools in the table above. If one fits the user's request, call it via \`POST ${base}/mcp/call_tool\`.
2. If no listed tool fits, call **GET or POST** \`${base}/mcp/list_tools\` to get the latest tool list (new tools may have been added).
3. If after that you still find no suitable tool, **tell the user clearly that the task cannot be completed** with the current MCP tools.
`
                : '';

        return `---
name: obsidian-note-chain-mcp
description: Call Obsidian MCP tools via Note-Chain HTTP server. Use when the user or task needs to list available MCP tools, call a tool (e.g. get current note, search vault), or integrate with Obsidian from an agent. Requires the Note-Chain HTTP server running at the given base URL.
---

# Note-Chain MCP Agent Skill

Call MCP tools exposed by the Note-Chain plugin over HTTPS. Base URL must point to a running Note-Chain server (e.g. \`https://127.0.0.1:3000\`).

## Base URL

\`\`\`
${base}
\`\`\`
${toolsTable}
## List tools (when table is not enough)

**GET or POST** \`${base}/mcp/list_tools\`

Returns \`{ "tools": [ { "name", "description", "inputSchema" }, ... ] }\`.

\`\`\`javascript
const res = await fetch(\`${base}/mcp/list_tools\`);
const data = await res.json();
console.log(data.tools);
\`\`\`

## Call a tool

**POST** \`${base}/mcp/call_tool\`

Body (JSON):

\`\`\`json
{
  "name": "tool_name_without_md",
  "arguments": { "key": "value" }
}
\`\`\`

Returns \`{ "content": [ { "type": "text", "text": "..." } ] }\`.

\`\`\`javascript
const response = await fetch(\`${base}/mcp/call_tool\`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'get_current_note',
    arguments: { query: 'test' }
  })
});
const data = await response.json();
console.log(data.content);
\`\`\`

## Test page

Open in browser: \`${base}/mcp/test\` to try listing and calling tools from a form.
`;
    }

    /** 异步生成 SKILL 内容（含当前工具表格），供 HTTP 与命令使用 */
    async getMCPSkillMarkdownAsync(baseUrl: string): Promise<string> {
        const tools = await this.tools.getMCPToolsList();
        return this.getMCPSkillMarkdown(baseUrl, tools);
    }

    /** GET /mcp/skill 返回 SKILL.md 内容，便于 Agent 或用户复制 */
    async handleMCPSkill(req: any, res: any) {
        const host = req.headers.host || `127.0.0.1:${this.getPort()}`;
        const baseUrl = `https://${host}`;
        const markdown = await this.getMCPSkillMarkdownAsync(baseUrl);
        res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
        res.end(markdown);
    }
}
