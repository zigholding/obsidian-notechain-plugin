import { MCPStreamableHttp } from '../src/server/mcpStreamableHttp';
import type { HttpReq, HttpRes } from '../src/http-types';

const TOOLS = [
    'obsidian_read',
    'obsidian_create',
    'obsidian_write',
    'obsidian_set_frontmatter',
    'get_current_note',
    'obsidian_query_by_datacore',
    'obsidian_get_outlinks',
    'obsidian_get_inlinks',
    'obsidian_get_brothers',
    'obsidian_parse_templater',
    '自然语言快速记录',
    'Alt+1 插入任务',
    '记录瞬时笔记',
    '获取任务列表',
].map((name) => ({ name, description: name, inputSchema: { type: 'object' } }));

function headerText(value: string | number | readonly string[]): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    return value.join(', ');
}

function assert(cond: unknown, message: string): void {
    if (!cond) throw new Error(message);
}

function mockExchange(method: string, headers: Record<string, string>, body: string) {
    const outHeaders: Record<string, string> = {};
    let status = 0;
    let raw = '';
    const req = {
        method,
        url: '/mcp',
        headers,
        on(event: string, listener: (...args: unknown[]) => void) {
            if (event === 'data') listener(body);
            if (event === 'end') listener();
            return req;
        },
    } as HttpReq;
    const res: HttpRes = {
        headersSent: false,
        setHeader(name: string, value: string | number | readonly string[]) {
            outHeaders[name.toLowerCase()] = headerText(value);
        },
        writeHead(code: number, h?: Record<string, string | number | readonly string[]>) {
            status = code;
            res.headersSent = true;
            if (h) {
                for (const [key, value] of Object.entries(h)) outHeaders[key.toLowerCase()] = headerText(value);
            }
            return res;
        },
        write() {
            return true;
        },
        end(chunk?: string | Uint8Array) {
            res.headersSent = true;
            raw = typeof chunk === 'string' ? chunk : '';
            return res;
        },
        on() {
            return res;
        },
        once() {
            return res;
        },
        emit() {
            return false;
        },
        removeListener() {
            return res;
        },
    };
    return {
        req,
        res,
        status: () => status,
        body: () => raw,
        header: (name: string) => outHeaders[name.toLowerCase()],
    };
}

async function main(): Promise<void> {
    let calls = 0;
    const mcp = new MCPStreamableHttp({
        listTools: () => Promise.resolve(TOOLS),
        callTool: (name, args) => {
            calls += 1;
            assert(name === 'obsidian_read', 'tool name');
            assert(args.path === 'a.md', 'tool args');
            return Promise.resolve([{ type: 'text', text: 'note-body' }]);
        },
    });

    const initBody = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'c', version: '1' },
        },
    });
    const init = mockExchange('POST', {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
    }, initBody);
    await mcp.handle(init.req, init.res);
    assert(init.status() === 200, `initialize status ${init.status()}`);
    assert(init.header('content-type') === 'application/json', `content-type ${init.header('content-type')}`);
    const session = init.header('mcp-session-id');
    assert(!!session, 'missing Mcp-Session-Id');
    const initJson = JSON.parse(init.body()) as {
        result: { protocolVersion: string; capabilities: { tools: unknown }; serverInfo: { name: string } };
    };
    assert(initJson.result.protocolVersion === '2025-03-26', 'protocol');
    assert(JSON.stringify(initJson.result.capabilities.tools) === '{}', 'tools capability');
    assert(initJson.result.serverInfo.name === 'NoteChain MCP Server', 'server name');

    const noted = mockExchange('POST', {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-session-id': session,
    }, JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }));
    await mcp.handle(noted.req, noted.res);
    assert(noted.status() === 202, `initialized status ${noted.status()}`);
    assert(noted.body() === '', 'initialized body should be empty');
    assert(noted.header('content-type') === undefined, 'initialized should not send a content-type');

    const listed = mockExchange('POST', {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-session-id': session,
    }, JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }));
    await mcp.handle(listed.req, listed.res);
    assert(listed.status() === 200, 'tools/list status');
    assert(listed.header('content-type') === 'application/json', 'tools/list content-type');
    const listedJson = JSON.parse(listed.body()) as { result: { tools: unknown[] } };
    assert(listedJson.result.tools.length === 14, `tool count ${listedJson.result.tools.length}`);

    const called = mockExchange('POST', {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-session-id': session,
    }, JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'obsidian_read', arguments: { path: 'a.md' } },
    }));
    await mcp.handle(called.req, called.res);
    assert(called.status() === 200, 'tools/call status');
    assert(calls === 1, 'call count');
    const calledJson = JSON.parse(called.body()) as { result: { content: { text: string }[] } };
    assert(calledJson.result.content[0].text === 'note-body', 'tool text');

    const bare = mockExchange('POST', {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
    }, JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/list' }));
    await mcp.handle(bare.req, bare.res);
    assert(bare.status() === 400, `missing session ${bare.status()}`);

    const batch = mockExchange('POST', {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-session-id': session,
    }, JSON.stringify([{ jsonrpc: '2.0', id: 5, method: 'tools/list' }]));
    await mcp.handle(batch.req, batch.res);
    assert(batch.status() === 400, 'batch');

    const evil = mockExchange('POST', {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        origin: 'http://evil.example',
        host: '127.0.0.1:3004',
    }, initBody);
    await mcp.handle(evil.req, evil.res);
    assert(evil.status() === 403, `origin ${evil.status()}`);

    const local = mockExchange('POST', {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        origin: 'http://127.0.0.1:3004',
    }, initBody);
    await mcp.handle(local.req, local.res);
    assert(local.status() === 200, 'localhost origin');

    const newer = mockExchange('POST', {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
    }, JSON.stringify({
        jsonrpc: '2.0',
        id: 6,
        method: 'initialize',
        params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'c', version: '1' } },
    }));
    await mcp.handle(newer.req, newer.res);
    const newerJson = JSON.parse(newer.body()) as { result: { protocolVersion: string } };
    assert(newerJson.result.protocolVersion === '2025-11-25', 'echo newer');

    const unknown = mockExchange('POST', {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
    }, JSON.stringify({
        jsonrpc: '2.0',
        id: 7,
        method: 'initialize',
        params: { protocolVersion: '1999-01-01', capabilities: {}, clientInfo: { name: 'c', version: '1' } },
    }));
    await mcp.handle(unknown.req, unknown.res);
    const unknownJson = JSON.parse(unknown.body()) as { result: { protocolVersion: string } };
    assert(unknownJson.result.protocolVersion === '2025-03-26', 'fallback protocol');

    const sseOnly = mockExchange('POST', {
        'content-type': 'application/json',
        accept: 'text/event-stream',
        'mcp-session-id': session,
    }, JSON.stringify({ jsonrpc: '2.0', id: 8, method: 'ping' }));
    await mcp.handle(sseOnly.req, sseOnly.res);
    assert(sseOnly.status() === 200, 'sse ping status');
    assert(sseOnly.header('content-type') === 'text/event-stream', 'sse content-type');
    assert(sseOnly.body().includes('data: '), 'sse data');

    const getOk = mockExchange('GET', { accept: 'text/event-stream', 'mcp-session-id': session }, '');
    await mcp.handle(getOk.req, getOk.res);
    assert(getOk.status() === 405, `GET ${getOk.status()}`);

    const deleted = mockExchange('DELETE', { 'mcp-session-id': session }, '');
    await mcp.handle(deleted.req, deleted.res);
    assert(deleted.status() === 200, `DELETE ${deleted.status()}`);

    const again = mockExchange('DELETE', { 'mcp-session-id': session }, '');
    await mcp.handle(again.req, again.res);
    assert(again.status() === 404, `second DELETE ${again.status()}`);

    const reused = mockExchange('POST', {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-session-id': session,
    }, JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'tools/list' }));
    await mcp.handle(reused.req, reused.res);
    assert(reused.status() === 404, `deleted session ${reused.status()}`);

}

void main();
