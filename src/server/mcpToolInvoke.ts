import { Templater } from '../easyapi/templater';

export function mcpToolScriptName(toolName: string): string {
    return toolName.endsWith('.md') ? toolName : `${toolName}.md`;
}

export function mcpContentFromResult(result: unknown): unknown[] {
    const items = Array.isArray(result) ? result : [result];
    return items.map((item: unknown) => {
        if (typeof item === 'object' && item !== null) {
            return item;
        }
        return {
            type: 'text',
            text: primitiveText(item),
        };
    });
}

function primitiveText(item: unknown): string {
    if (typeof item === 'string') return item;
    if (typeof item === 'number' || typeof item === 'boolean' || typeof item === 'bigint') {
        return String(item);
    }
    return '';
}

export async function invokeMcpTool(
    templater: Templater,
    toolName: string,
    toolArguments: Record<string, unknown>,
): Promise<unknown[]> {
    const result = await templater.parse_templater(
        mcpToolScriptName(toolName),
        true,
        toolArguments,
        null,
        '',
    );
    return mcpContentFromResult(result);
}
