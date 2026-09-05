import { Notice } from 'obsidian';

import type NoteChainPlugin from '../plugin';
import type { WebViewerLLMModule } from './WebViewerLLMModule';


export class WebViewerLLMUiCommands {
	plugin!: NoteChainPlugin;

	async cmd_paste_last_active_llm(this: WebViewerLLMModule) {
		const llm = await this.get_last_active_llm();
		if (!llm) {
			return;
		}
		const rsp = await llm.get_last_content();
		if (!rsp) {
			return;
		}
		this.easyapi.ceditor?.replaceSelection(rsp);
	}

	async cmd_probe_active_llm_elements(this: WebViewerLLMModule) {
		const llm = await this.get_last_active_llm();
		if (!llm) {
			new Notice('No active LLM webview found');
			return;
		}
		const result = await llm.probe_action_elements();
		if (!result) {
			new Notice(`${llm.name}: probe failed`);
			return;
		}
		const okCount = [result.input, result.send, result.copy].filter(Boolean).length;
		new Notice(`${llm.name}: probe ${okCount}/3 (see console)`);
	}

	async cmd_copy_active_llm_profile_snippet(this: WebViewerLLMModule) {
		const llm = await this.get_last_active_llm();
		if (!llm) {
			new Notice('No active LLM webview found');
			return;
		}
		const result = await llm.probe_action_elements();
		if (!result) {
			new Notice(`${llm.name}: probe failed`);
			return;
		}
		const quote = (x: string) => `'${x.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
		const lines: string[] = [];
		lines.push(`// ${llm.name} (${result.url || llm.homepage})`);
		lines.push('{');
		if (result.input?.selector) {
			lines.push(`\tinputSelectors: [${quote(result.input.selector)}],`);
		}
		if (result.send?.selector) {
			lines.push(`\tsendButtonSelectors: [${quote(result.send.selector)}],`);
		}
		if (result.copy?.selector) {
			lines.push(`\tcopyButtonSelectors: [${quote(result.copy.selector)}],`);
		}
		lines.push('}');
		const snippet = lines.join('\n');
		try {
			await this.easyapi.editor.write_clipboard(snippet);
			new Notice(`${llm.name}: profile snippet copied`);
		} catch {
			new Notice(`${llm.name}: copy failed, snippet in console`);
		}
	}

	async cmd_paste_to_markdown(this: WebViewerLLMModule, anyblock = 'list2tab') {
		const tfile = this.easyapi.cfile;
		if (!tfile) {
			return;
		}

		await this.cmd_refresh_llms();

		const llms = this.llms;
		if (llms.length == 0) {
			return;
		}

		const rsps = await Promise.all(llms.map((x) => x.get_last_content()));
		let xtx = '';
		if (llms.length > 1) {
			xtx = `[${anyblock}|addClass(ab-col${llms.length})]\n`;
		}
		for (let i = 0; i < rsps.length; i++) {
			const name = llms[i].name;
			xtx =
				xtx +
				'\n' +
				`
- ${name}
\`\`\`dataviewjs
dv.span(
	${JSON.stringify(rsps[i])}
)
\`\`\`
		`
					.trim()
					.replace(/\n/g, '\n\t');
		}
		xtx = '\n\n' + xtx.trim() + '\n\n';
		this.easyapi.ceditor?.replaceSelection(xtx);
	}

}
