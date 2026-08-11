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

export class WebViewerLLMChatCommands {
	/** Host WebViewerLLMModule fields/methods (filled by applyMixins). */
	[key: string]: any;

	async get_prompt(tfile: TFile | null, idx = -1, selection = false) {
		if (!tfile) {
			return '';
		}
		let prompt: any = '';
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
			prompt = await this.easyapi.editor.get_code_section(tfile, item as string, -1);
			if (prompt) {
				return prompt;
			}

			prompt = await this.easyapi.editor.get_heading_section(tfile, item as string, -1, false);
			if (prompt) {
				return prompt;
			}
		}

		if (selection && !prompt) {
			prompt = await this.easyapi.editor.get_selection();
		}

		if (!prompt) {
			prompt = await this.easyapi.nc.editor.remove_metadata(tfile);
		}

		if (prompt) {
			return prompt;
		}

		return '';
	}

	async cmd_chat_every_llms(prompt = '') {
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

	async cmd_chat_first_llms() {
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
