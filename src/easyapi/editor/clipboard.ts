import { App, TFile } from 'obsidian';
import type { EasyAPI } from '../easyapi';
import type { EasyEditor } from '../editor';
import { legacyClipboardExecCopy } from './codeFence';

export class EasyEditorClipboard {
	app!: App;
	ea!: EasyAPI;
	nretry!: number;

    async insert_after_line(this: EasyEditor, tfile: TFile, aline: string, LINE: string, tail = true, suffix = '\n\n') {
        if (!tfile) { return false }
        let ctx = await this.ea.app.vault.cachedRead(tfile)

        let idx = ctx.indexOf(LINE)

        if (idx == -1 && tail) {
            ctx = `${ctx}${suffix}${aline}`
        } else {
            ctx = `${ctx.slice(0, idx + LINE.length)}\n${aline}${ctx.slice(idx + LINE.length)}`
        }
        await this.ea.app.vault.modify(tfile, ctx)
        return true;
    }


    async read_clipboard(this: EasyEditor): Promise<string> {
		try {
			if (navigator?.clipboard?.readText) {
				return (await navigator.clipboard.readText()) ?? '';
			}
		} catch (_e) {
			// Mobile WebView often denies read permission; ignore and continue.
		}
		return '';
	}

	async write_clipboard(this: EasyEditor, text: string): Promise<boolean> {
		try {
			if (navigator?.clipboard?.writeText) {
				await navigator.clipboard.writeText(text);
				return true;
			}
		} catch (_e) {
			// Fallback below.
		}
		try {
			const ta = document.createElement('textarea');
			ta.value = text;
			ta.className = 'nc-offscreen-copy';
			document.body.appendChild(ta);
			ta.focus();
			ta.select();
			const ok = legacyClipboardExecCopy();
			document.body.removeChild(ta);
			return ok;
		} catch (_e) {
			return false;
		}
	}

}
