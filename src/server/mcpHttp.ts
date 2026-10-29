import { App } from 'obsidian';
import { Templater } from '../easyapi/templater';
import { MCPToolsListService } from './mcpToolsList';
import { MCPSkillAndTestPages } from './mcpSkillAndTest';
import { MCPSseAndJsonRpc } from './mcpSseAndJsonRpc';
import { MCPStreamableHttp } from './mcpStreamableHttp';
import { invokeMcpTool } from './mcpToolInvoke';
import type { HttpReq, HttpRes, SseConnection } from '../http-types';

/** MCP HTTP：路由层委托给工具列表、Skill/测试页、SSE + JSON-RPC。 */
export class MCPHttpHandlers {
    private tools: MCPToolsListService;
    private skill: MCPSkillAndTestPages;
    private rpc: MCPSseAndJsonRpc;
    private streamable: MCPStreamableHttp;

    constructor(
        app: App,
        templater: Templater,
        sseConnections: Map<string, SseConnection>,
        private getPort: () => number,
    ) {
        this.tools = new MCPToolsListService(app, templater);
        this.skill = new MCPSkillAndTestPages(this.tools, () => this.getPort());
        this.rpc = new MCPSseAndJsonRpc(app, templater, sseConnections, this.tools);
        this.streamable = new MCPStreamableHttp({
            listTools: () => this.tools.getMCPToolsList(),
            callTool: (name, args) => invokeMcpTool(templater, name, args),
        });
    }

    close(): void {
        this.streamable.close();
    }

    handleMCPListTools = (req: HttpReq, res: HttpRes) => this.tools.handleMCPListTools(req, res);
    handleMCPCallTool = (req: HttpReq, res: HttpRes) => this.rpc.handleMCPCallTool(req, res);
    handleSSEConnection = (req: HttpReq, res: HttpRes) => this.rpc.handleSSEConnection(req, res);
    handleMCPMessage = (req: HttpReq, res: HttpRes) => this.rpc.handleMCPMessage(req, res);
    handleStreamable = (req: HttpReq, res: HttpRes) => this.streamable.handle(req, res);
    handleMCPTestPage = (req: HttpReq, res: HttpRes) => this.skill.handleMCPTestPage(req, res);
    handleMCPSkill = (req: HttpReq, res: HttpRes) => this.skill.handleMCPSkill(req, res);

    getMCPSkillMarkdown(baseUrl: string, tools?: unknown[]) {
        return this.skill.getMCPSkillMarkdown(baseUrl, tools);
    }

    getMCPSkillMarkdownAsync(baseUrl: string) {
        return this.skill.getMCPSkillMarkdownAsync(baseUrl);
    }
}
