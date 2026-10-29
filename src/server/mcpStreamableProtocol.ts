/** Streamable HTTP（MCP 2025-03-26）里与传输无关的判定。 */

export const MCP_PROTOCOL_IMPLEMENTED = '2025-03-26';

const SUPPORTED_PROTOCOL_VERSIONS = new Set([
    '2025-11-25',
    '2025-06-18',
    '2025-03-26',
    '2024-11-05',
    '2024-10-07',
]);

export function isSupportedMcpProtocolVersion(version: string): boolean {
    return SUPPORTED_PROTOCOL_VERSIONS.has(version);
}

/** 客户端声明的版本在支持列表里则原样回，否则回本实现的版本。 */
export function negotiateMcpProtocolVersion(requested: unknown): string {
    if (typeof requested === 'string' && SUPPORTED_PROTOCOL_VERSIONS.has(requested)) {
        return requested;
    }
    return MCP_PROTOCOL_IMPLEMENTED;
}

export function headerOne(
    headers: Record<string, string | string[] | undefined>,
    name: string,
): string | undefined {
    const value = headers[name.toLowerCase()] ?? headers[name];
    if (Array.isArray(value)) return value[0];
    return typeof value === 'string' ? value : undefined;
}

export function mediaType(header: string | undefined): string {
    if (!header) return '';
    return header.split(';')[0].trim().toLowerCase();
}

/** 有 Origin 且不在本机 / 与 Host 相同才拒绝；没有 Origin 放行。 */
export function mcpOriginAllowed(origin: string | undefined, hostHeader: string | undefined): boolean {
    if (!origin) return true;
    let hostname = '';
    try {
        hostname = new URL(origin).hostname.toLowerCase();
    } catch {
        return false;
    }
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
        return true;
    }
    return hostname === hostnameOfHostHeader(hostHeader);
}

function hostnameOfHostHeader(host: string | undefined): string {
    if (!host) return '';
    const trimmed = host.trim().toLowerCase();
    if (trimmed.startsWith('[')) {
        const end = trimmed.indexOf(']');
        return end > 1 ? trimmed.slice(1, end) : '';
    }
    return trimmed.split(':')[0];
}

/** Accept 同时带 json 与 sse 时用一次性 JSON。只有 sse 时用事件流。都没有则拒绝。 */
export function mcpResponseMode(accept: string | undefined): 'json' | 'sse' | 'reject' {
    if (!accept || !accept.trim()) return 'json';
    const lower = accept.toLowerCase();
    const json = lower.includes('application/json');
    const sse = lower.includes('text/event-stream');
    if (json) return 'json';
    if (sse) return 'sse';
    return 'reject';
}

/** 通知，或客户端发来的无 id 响应。initialize 即使没有 id 也要回结果。 */
export function isMcpNotification(message: Record<string, unknown>): boolean {
    const method = message.method;
    const hasId = 'id' in message;
    if (typeof method === 'string' && method.startsWith('notifications/')) return true;
    if (!hasId && method !== 'initialize') return true;
    return false;
}
