import type { HttpReq, HttpRes } from '../http-types';
import { errorMessage, isRecord } from '../ts-helpers';
import {
    headerOne,
    isMcpNotification,
    mcpOriginAllowed,
    mcpResponseMode,
    mediaType,
    negotiateMcpProtocolVersion,
    isSupportedMcpProtocolVersion,
} from './mcpStreamableProtocol';

export interface McpToolHost {
    listTools(): Promise<unknown[]>;
    callTool(name: string, args: Record<string, unknown>): Promise<unknown[]>;
}

type JsonRpcResponse = {
    jsonrpc: '2.0';
    id: unknown;
    result?: unknown;
    error?: { code: number; message: string; data?: unknown };
};

interface McpSession {
    protocolVersion: string;
}

/**
 * MCP Streamable HTTP：单一 `/mcp` 处理 POST / GET / DELETE。
 * 旧的 `/sse` + `/messages` 仍由 MCPSseAndJsonRpc 处理。
 */
export class MCPStreamableHttp {
    private sessions = new Map<string, McpSession>();
    private eventSeq = 0;

    constructor(private tools: McpToolHost) {}

    close(): void {
        this.sessions.clear();
    }

    async handle(req: HttpReq, res: HttpRes): Promise<void> {
        if (!mcpOriginAllowed(headerOne(req.headers, 'origin'), headerOne(req.headers, 'host'))) {
            this.writeRpc(req, res, 403, this.rpcError(null, -32000, 'Forbidden origin'));
            return;
        }

        const method = req.method || 'GET';
        if (method === 'GET') {
            this.handleGet(req, res);
            return;
        }
        if (method === 'DELETE') {
            this.handleDelete(req, res);
            return;
        }
        if (method === 'POST') {
            await this.handlePost(req, res);
            return;
        }
        res.writeHead(405, { Allow: 'GET, POST, DELETE' });
        res.end();
    }

    private handleGet(req: HttpReq, res: HttpRes): void {
        const sessionId = headerOne(req.headers, 'mcp-session-id');
        if (!sessionId) {
            this.writeRpc(req, res, 400, this.rpcError(null, -32000, 'Mcp-Session-Id required'));
            return;
        }
        if (!this.sessions.has(sessionId)) {
            this.writeRpc(req, res, 404, this.rpcError(null, -32001, 'Session not found'));
            return;
        }
        res.writeHead(405, { Allow: 'POST, DELETE' });
        res.end();
    }

    private handleDelete(req: HttpReq, res: HttpRes): void {
        const sessionId = headerOne(req.headers, 'mcp-session-id');
        if (!sessionId) {
            this.writeRpc(req, res, 400, this.rpcError(null, -32000, 'Mcp-Session-Id required'));
            return;
        }
        if (!this.sessions.delete(sessionId)) {
            this.writeRpc(req, res, 404, this.rpcError(null, -32001, 'Session not found'));
            return;
        }
        if (sessionId) {
            res.setHeader('Mcp-Session-Id', sessionId);
        }
        res.writeHead(200);
        res.end();
    }

    private async handlePost(req: HttpReq, res: HttpRes): Promise<void> {
        if (mediaType(headerOne(req.headers, 'content-type')) !== 'application/json') {
            this.writeRpc(req, res, 415, this.rpcError(null, -32600, 'Content-Type must be application/json'));
            return;
        }
        if (mcpResponseMode(headerOne(req.headers, 'accept')) === 'reject') {
            this.writeRpc(req, res, 406, this.rpcError(null, -32600, 'Accept must include application/json or text/event-stream'));
            return;
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(await readBody(req));
        } catch {
            this.writeRpc(req, res, 400, this.rpcError(null, -32700, 'Parse error'));
            return;
        }
        if (Array.isArray(parsed)) {
            this.writeRpc(req, res, 400, this.rpcError(null, -32600, 'Batch requests are not supported'));
            return;
        }
        if (!isRecord(parsed)) {
            this.writeRpc(req, res, 400, this.rpcError(null, -32600, 'Invalid Request'));
            return;
        }

        const id = Object.prototype.hasOwnProperty.call(parsed, 'id') ? parsed.id : null;
        if (parsed.jsonrpc !== '2.0') {
            this.writeRpc(req, res, 400, this.rpcError(id, -32600, 'Invalid Request'));
            return;
        }

        const method = typeof parsed.method === 'string' ? parsed.method : '';
        const params = isRecord(parsed.params) ? parsed.params : {};
        const incomingSession = headerOne(req.headers, 'mcp-session-id');

        if (method === 'initialize') {
            const protocolVersion = negotiateMcpProtocolVersion(params.protocolVersion);
            const sessionId = newSessionId();
            this.sessions.set(sessionId, { protocolVersion });
            const response: JsonRpcResponse = {
                jsonrpc: '2.0',
                id,
                result: {
                    protocolVersion,
                    capabilities: { tools: {} },
                    serverInfo: { name: 'NoteChain MCP Server', version: '1.0.0' },
                },
            };
            this.writeRpc(req, res, 200, response, sessionId);
            return;
        }

        if (!incomingSession) {
            this.writeRpc(req, res, 400, this.rpcError(id, -32000, 'Mcp-Session-Id required'));
            return;
        }
        const session = this.sessions.get(incomingSession);
        if (!session) {
            this.writeRpc(req, res, 404, this.rpcError(id, -32001, 'Session not found'));
            return;
        }

        const protocolHeader = headerOne(req.headers, 'mcp-protocol-version');
        if (protocolHeader && !isSupportedMcpProtocolVersion(protocolHeader.trim())) {
            this.writeRpc(
                req,
                res,
                400,
                this.rpcError(id, -32600, `Unsupported MCP-Protocol-Version: ${protocolHeader}`),
                incomingSession,
            );
            return;
        }

        if (isMcpNotification(parsed)) {
            res.setHeader('Mcp-Session-Id', incomingSession);
            res.writeHead(202);
            res.end();
            return;
        }

        try {
            const response = await this.dispatch(method, params, id);
            this.writeRpc(req, res, 200, response, incomingSession);
        } catch (error: unknown) {
            console.error('✗ MCP streamable error:', error);
            if (!res.headersSent) {
                this.writeRpc(
                    req,
                    res,
                    500,
                    this.rpcError(id, -32603, 'Internal error', errorMessage(error)),
                    incomingSession,
                );
            }
        }
    }

    private async dispatch(
        method: string,
        params: Record<string, unknown>,
        id: unknown,
    ): Promise<JsonRpcResponse> {
        if (method === 'ping') {
            return { jsonrpc: '2.0', id, result: {} };
        }
        if (method === 'tools/list') {
            const tools = await this.tools.listTools();
            return { jsonrpc: '2.0', id, result: { tools } };
        }
        if (method === 'tools/call') {
            const toolName = typeof params.name === 'string' ? params.name : '';
            const toolArguments = isRecord(params.arguments) ? params.arguments : {};
            if (!toolName) {
                return this.rpcError(id, -32602, 'Invalid params: tool name is required');
            }
            try {
                const content = await this.tools.callTool(toolName, toolArguments);
                return { jsonrpc: '2.0', id, result: { content } };
            } catch (error: unknown) {
                console.error('✗ Error calling tool:', error);
                return this.rpcError(id, -32603, 'Internal error', errorMessage(error));
            }
        }
        return this.rpcError(id, -32601, `Method not found: ${method}`);
    }

    private rpcError(id: unknown, code: number, message: string, data?: string): JsonRpcResponse {
        const error: JsonRpcResponse['error'] = { code, message };
        if (data !== undefined && data !== '') error.data = data;
        return { jsonrpc: '2.0', id, error };
    }

    private writeRpc(
        req: HttpReq,
        res: HttpRes,
        status: number,
        payload: JsonRpcResponse,
        sessionId?: string,
    ): void {
        if (sessionId) res.setHeader('Mcp-Session-Id', sessionId);
        const mode = status === 200 ? mcpResponseMode(headerOne(req.headers, 'accept')) : 'json';
        if (mode === 'sse') {
            this.eventSeq += 1;
            res.writeHead(status, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
            });
            res.end(`id: ${this.eventSeq}\nevent: message\ndata: ${JSON.stringify(payload)}\n\n`);
            return;
        }
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
    }
}

function newSessionId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function chunkText(chunk: unknown): string {
    if (typeof chunk === 'string') return chunk;
    if (chunk instanceof Uint8Array) return new TextDecoder().decode(chunk);
    return '';
}

function readBody(req: HttpReq): Promise<string> {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk: unknown) => {
            body += chunkText(chunk);
        });
        req.on('end', () => {
            resolve(body);
        });
        req.on('error', (error: Error) => {
            reject(error);
        });
    });
}
