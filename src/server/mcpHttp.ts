import { App } from 'obsidian';
import { Templater } from '../easyapi/templater';
import { MCPToolsListService } from './mcpToolsList';
import { MCPSkillAndTestPages } from './mcpSkillAndTest';
import { MCPSseAndJsonRpc } from './mcpSseAndJsonRpc';

/** MCP HTTP：路由层委托给工具列表、Skill/测试页、SSE + JSON-RPC。 */
export class MCPHttpHandlers {
    private tools: MCPToolsListService;
    private skill: MCPSkillAndTestPages;
    private rpc: MCPSseAndJsonRpc;

    constructor(
        app: App,
        templater: Templater,
        sseConnections: Map<string, any>,
        private getPort: () => number,
    ) {
        this.tools = new MCPToolsListService(app, templater);
        this.skill = new MCPSkillAndTestPages(this.tools, () => this.getPort());
        this.rpc = new MCPSseAndJsonRpc(app, templater, sseConnections, this.tools);
    }

    handleMCPListTools = (req: any, res: any) => this.tools.handleMCPListTools(req, res);
    handleMCPCallTool = (req: any, res: any) => this.rpc.handleMCPCallTool(req, res);
    handleSSEConnection = (req: any, res: any) => this.rpc.handleSSEConnection(req, res);
    handleMCPMessage = (req: any, res: any) => this.rpc.handleMCPMessage(req, res);
    handleMCPTestPage = (req: any, res: any) => this.skill.handleMCPTestPage(req, res);
    handleMCPSkill = (req: any, res: any) => this.skill.handleMCPSkill(req, res);

    getMCPSkillMarkdown(baseUrl: string, tools?: any[]) {
        return this.skill.getMCPSkillMarkdown(baseUrl, tools);
    }

    getMCPSkillMarkdownAsync(baseUrl: string) {
        return this.skill.getMCPSkillMarkdownAsync(baseUrl);
    }
}
