import { App } from 'obsidian';

import { EasyAPI } from 'src/easyapi/easyapi'

type DocWithSheets = Document & { __ncNoteCss?: Map<string, CSSStyleSheet> };

function sheetMap(doc: Document): Map<string, CSSStyleSheet> {
	const d = doc as DocWithSheets;
	if (!d.__ncNoteCss) d.__ncNoteCss = new Map();
	return d.__ncNoteCss;
}

/** Apply or remove a note's CSS via adopted stylesheets (no `<style>` / innerHTML). */
export function applyAdoptedNoteCss(doc: Document, id: string, css: string, removeIfPresent: boolean): void {
	if (!doc?.adoptedStyleSheets || typeof CSSStyleSheet === 'undefined') return;
	const map = sheetMap(doc);
	const existing = map.get(id);
	if (existing && removeIfPresent) {
		doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter((s) => s !== existing);
		map.delete(id);
		return;
	}
	if (!css) return;
	let sheet = existing;
	if (!sheet) {
		sheet = new CSSStyleSheet();
		map.set(id, sheet);
		doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
	}
	sheet.replaceSync(css);
}

export class CSS {
	app: App;
	ea: EasyAPI;

	constructor(app: App, api: EasyAPI) {
		this.app = app;
		this.ea = api;
	}

	async toogle_note_css(document: Document, name: string, refresh = false) {
		let tfile = this.ea.file.get_tfile(name);
		if (!tfile) { return }

		const css = await this.ea.editor.extract_code_block(tfile, 'css')
		const inner = css.join('\n')
		applyAdoptedNoteCss(document, tfile.basename, inner, refresh);
	}
}
