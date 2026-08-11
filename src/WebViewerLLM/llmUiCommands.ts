import { Notice, TFile } from 'obsidian';

import type { CardItem } from '../easyapi/gui/inputCardSuggester';
import type NoteChainPlugin from '../plugin';
import { WebViewLLMSettings_DEFAULT } from './setting';
import { strings } from './strings';
import { BaseWebViewer } from './LLM/BaseWebViewer';
import { DeepSeek } from './LLM/DeepSeek';
import { Doubao } from './LLM/Doubao';
import { Kimi } from './LLM/Kimi';
import { Yuanbao } from './LLM/Yuanbao';
import { ChatGPT } from './LLM/ChatGPT';
import { ChatGLM } from './LLM/ChatGLM';
import { Gemini } from './LLM/Gemini';
import { Claude } from './LLM/Claude';

export class WebViewerLLMUiCommands {
	/** Host WebViewerLLMModule fields/methods (filled by applyMixins). */
	[key: string]: any;

	async cmd_paste_last_active_llm() {
		const llm = await this.get_last_active_llm();
		if (!llm) {
			return;
		}
		const rsp = await llm.get_last_content();
		if (!rsp) {
			return;
		}
		this.easyapi.ceditor.replaceSelection(rsp);
	}

	async cmd_probe_active_llm_elements() {
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

	async cmd_copy_active_llm_profile_snippet() {
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
		} catch (e) {
			new Notice(`${llm.name}: copy failed, snippet in console`);
		}
	}

	async cmd_paste_to_markdown(anyblock = 'list2tab') {
		const tfile = this.easyapi.cfile;
		if (!tfile) {
			return;
		}

		await this.cmd_refresh_llms();

		const llms = this.llms;
		if (llms.length == 0) {
			return;
		}

		const rsps = await Promise.all(llms.map((x: any) => x.get_last_content()));
		let xtx = '';
		if (llms.length > 1) {
			xtx = `[${anyblock}|addClass(ab-col${llms.length})]\n`;
		}
		for (const i in rsps) {
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
		this.easyapi.ceditor.replaceSelection(xtx);
	}

}
