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
			const code = await this.easyapi.editor.get_code_section(tfile, item as string, -1);
			if (typeof code === 'string' && code) {
				return code;
			}

			const heading = await this.easyapi.editor.get_heading_section(tfile, item as string, -1, false);
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
