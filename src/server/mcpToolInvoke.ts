import { Templater } from '../easyapi/templater';
import { isRecord } from '../ts-helpers';

export function mcpToolScriptName(toolName: string): string {
    return toolName.endsWith('.md') ? toolName : `${toolName}.md`;
}

/** MCP `tools/call` 的 `content` 必须是内容块数组。已是内容块的数组原样返回；其它值（含 `[1,2,3]`）整段写成一条 text。 */
export function mcpContentFromResult(result: unknown): unknown[] {
    if (Array.isArray(result) && result.every(isContentBlock)) return result;
    if (isContentBlock(result)) return [result];
    return [{ type: 'text', text: contentText(result) }];
}

function isContentBlock(item: unknown): item is Record<string, unknown> {
    return isRecord(item) && typeof item.type === 'string';
}

function contentText(item: unknown): string {
    if (typeof item === 'string') return item;
    if (typeof item === 'number' || typeof item === 'boolean' || typeof item === 'bigint') {
        return String(item);
    }
    if (item === null || item === undefined) return '';
    try {
        return JSON.stringify(item);
    } catch {
        return '';
    }
}

export async function invokeMcpTool(
    templater: Templater,
    toolName: string,
    toolArguments: Record<string, unknown>,
): Promise<unknown> {
    const result = await templater.parse_templater(
        mcpToolScriptName(toolName),
        true,
        toolArguments,
        0,
        '',
    );
    return mcpContentFromResult(result);
}
