import { TFile } from 'obsidian';

import type NoteChainPlugin from '../plugin';
import type { WebViewerLLMModule } from './WebViewerLLMModule';


export class WebViewerLLMChatCommands {
	plugin!: NoteChainPlugin;

	async get_prompt(this: WebViewerLLMModule, tfile: TFile | null, idx = -1, selection = false): Promise<string> {
		if (!tfile) {
			return '';
		}
		const items = this.plugin.settings.webviewllm.prompt_name.trim().split('\n');
		if (items.length == 0) {
			return '';
		}

		const allItemsSet = new Set(items);
		for (const item of items) {
			const firstUpper = item.charAt(0).toUpperCase() + item.slice(1);
			allItemsSet.add(firstUpper);
			const allUpper = item.toUpperCase();
			allItemsSet.add(allUpper);
		}
		const allItems = Array.from(allItemsSet);

		for (const item of allItems) {
			const code = await this.easyapi.editor.get_code_section(tfile, item, -1);
			if (typeof code === 'string' && code) {
				return code;
			}

			const heading = await this.easyapi.editor.get_heading_section(tfile, item, -1, false);
			if (typeof heading === 'string' && heading) {
				return heading;
			}
		}

		if (selection) {
			const sel = await this.easyapi.editor.get_selection();
			if (sel) {
				return sel;
			}
		}

		const body = await this.plugin.editor.remove_metadata(tfile);
		if (body) {
			return body;
		}

		return '';
	}

	/**
	 * 从提示词来源走到发给 LLM 之前的最终 prompt。
	 * 含来源选择、get_prompt、占位符、交互变量、target、Templater、参考笔记、预处理。
	 * `file` 为笔记名或路径时解析成提示词笔记；对不上笔记时当作原始 prompt 文本。
	 * 用户取消时返回 null。
	 */
	async get_final_prompt(
		this: WebViewerLLMModule,
		file: TFile | string | null = null,
		target: unknown = null
	): Promise<{ prompt: string; noteFile: TFile | null; currentFile: TFile | null } | null> {
		const ea = this.easyapi;
		const cfile = ea.file.get_last_activate_file();
		const selection = await ea.editor.get_selection();

		let promptFile: TFile | null = null;
		let rawText: string | null = null;
		if (file instanceof TFile) {
			promptFile = file;
		} else if (typeof file === 'string' && file.trim()) {
			const named = ea.file.get_tfile(file.trim());
			if (named instanceof TFile) {
				promptFile = named;
			} else {
				rawText = file;
			}
		}

		let source: TFile | string | null = promptFile ?? rawText;
		let xrefiles: Array<TFile> = [];
		if (!source) {
			const selected = await this.select_chat_source(cfile ?? null, selection);
			if (!selected) return null;
			source = selected.source;
			xrefiles = selected.xrefiles;
			promptFile = source instanceof TFile ? source : null;
		}
		if (!source) return null;

		let prompt = '';
		let noteFile: TFile | null;
		if (source instanceof TFile) {
			prompt = await this.get_prompt(source);
			noteFile = source;
			promptFile = source;
		} else {
			prompt = source;
			noteFile = cfile ?? null;
			promptFile = null;
		}
		prompt = prompt.replace(/^\s*%%[\s\S]*?%%/, '').trim();

		const allowTemplater =
			this.is_templater_parse_enabled(promptFile) &&
			this.is_templater_parse_enabled(cfile);

		const expanded = await this.expand_prompt_placeholders(prompt, cfile ?? null, allowTemplater);
		if (expanded == null) return null;
		prompt = expanded;

		const filled = await this.fill_interactive_prompt_vars(prompt, selection);
		if (filled == null) return null;
		prompt = filled;

		prompt = this.apply_target_replacements(prompt, target);

		const currentFile = cfile ?? null;

		prompt = await this.run_prompt_templater(prompt, noteFile, currentFile, allowTemplater);
		prompt = await this.append_selected_references(prompt, noteFile, currentFile, xrefiles);
		prompt = await this.run_webviewllm_preprocess(prompt, noteFile, currentFile);

		return { prompt, noteFile, currentFile };
	}

	async cmd_chat_every_llms(this: WebViewerLLMModule, prompt = '') {
		await this.cmd_refresh_llms();
		if (prompt == '') {
			prompt = await this.get_prompt(this.easyapi.cfile, 0, true);
		}
		if (prompt == '') {
			return;
		}

		const promises = [];
		for (const llm of this.llms) {
			promises.push(llm.request(prompt));
		}
		const responses = await Promise.all(promises);
		return responses;
	}

	async cmd_chat_first_llms(this: WebViewerLLMModule) {
		const llm = await this.get_last_active_llm();
		if (!llm) {
			return;
		}

		const prompt = await this.get_prompt(this.easyapi.cfile, 0, true);
		if (prompt == '') {
			return;
		}

		const rsp = await llm.request(prompt);
		return rsp;
	}

}
