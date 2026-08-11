/** Shared fenced-code / clipboard helpers for EasyEditor. */

export function codeFenceStartsWithLanguage(trimmed: string, ctype: string): boolean {
    const m = trimmed.match(/^(`{3,}|~{3,})/);
    if (!m) return false;
    if (!ctype) return true;
    return trimmed.startsWith(m[1] + ctype);
}

export function fencedCodeInnerContent(c: string): string | null {
    const m = c.match(/^(`{3,}|~{3,})([^\n]*)\r?\n([\s\S]*)/);
    if (!m) return null;
    const n = m[1].length;
    const ch = m[1][0];
    const esc = ch === '`' ? '`' : '~';
    const closeRe = new RegExp('^' + esc + '{' + n + ',}\\s*$');
    const lines = m[3].split(/\r?\n/);
    for (let i = lines.length - 1; i >= 0; i--) {
        if (closeRe.test(lines[i])) {
            return lines.slice(0, i).join('\n');
        }
    }
    return null;
}

/** 首行开围栏 + 末行闭围栏（与解析失败时兜底） */
export function fencedCodeInnerLoose(c: string): string | null {
    const lines = c.split(/\r?\n/);
    if (lines.length < 2) return null;
    const top = lines[0].match(/^(`{3,}|~{3,})/);
    const bot = lines[lines.length - 1].match(/^(`{3,}|~{3,})\s*$/);
    if (!top || !bot || top[1][0] !== bot[1][0] || bot[1].length < top[1].length) {
        return null;
    }
    return lines.slice(1, -1).join('\n');
}

/**
 * Last-resort copy when `navigator.clipboard.writeText` is missing or throws.
 * Avoids a direct `document.execCommand` call so DOM typings do not surface it as deprecated.
 */
export function legacyClipboardExecCopy(doc: Document = document): boolean {
	try {
		const execCommand = Reflect.get(doc, 'execCommand');
		if (typeof execCommand !== 'function') return false;
		return Reflect.apply(execCommand as (this: Document, commandId: string) => boolean, doc, ['copy']);
	} catch {
		return false;
	}
}
