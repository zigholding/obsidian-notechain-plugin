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

export class WebViewerLLMRegistry {
	/** Host WebViewerLLMModule fields/methods (filled by applyMixins). */
	[key: string]: any;

	get app() {
		return this.plugin.app;
	}

	get easyapi() {
		return this.plugin.easyapi;
	}

	async init() {
		this.auto_chat = true;
	}

	async cmd_refresh_llms() {
		const views = this.basewv.views;
		this.llms = this.llms.slice(0, 0);
		for (const view of views) {
			if ((view as any).url.startsWith(this.deepseek.homepage)) {
				const llm = new DeepSeek(this.app);
				llm.view = view;
				this.deepseek.view = view;
				this.llms.push(llm);
			} else if ((view as any).url.startsWith(this.doubao.homepage)) {
				const llm = new Doubao(this.app);
				llm.view = view;
				this.doubao.view = view;
				this.llms.push(llm);
			} else if ((view as any).url.startsWith(this.kimi.homepage)) {
				const llm = new Kimi(this.app);
				llm.view = view;
				this.kimi.view = view;
				this.llms.push(llm);
			} else if ((view as any).url.startsWith(this.chatgpt.homepage)) {
				const llm = new ChatGPT(this.app);
				llm.view = view;
				this.chatgpt.view = view;
				this.llms.push(llm);
			} else if ((view as any).url.startsWith(this.yuanbao.homepage)) {
				const llm = new Yuanbao(this.app);
				llm.view = view;
				this.yuanbao.view = view;
				this.llms.push(llm);
			} else if ((view as any).url.startsWith(this.chatglm.homepage)) {
				const llm = new ChatGLM(this.app);
				llm.view = view;
				this.chatglm.view = view;
				this.llms.push(llm);
			} else if ((view as any).url.startsWith(this.gemini.homepage)) {
				const llm = new Gemini(this.app);
				llm.view = view;
				this.gemini.view = view;
				this.llms.push(llm);
			} else if ((view as any).url.startsWith(this.claude.homepage)) {
				const llm = new Claude(this.app);
				llm.view = view;
				this.claude.view = view;
				this.llms.push(llm);
			}
		}
	}

	async cmd_chat_sequence() {
		await this.cmd_refresh_llms();
		if (this.llms.length == 0) {
			return;
		}
		this.auto_chat = true;
		let idx = 0;
		let llm = this.llms[idx];
		let rsp = (await llm.get_last_content()) ?? '';
		let prevs: string[] = [];
		while (this.auto_chat && rsp && rsp != '') {
			if (this.plugin.settings.webviewllm.auto_stop.split('\n').contains(rsp.trim())) {
				this.auto_chat = false;
				break;
			}
			const patterns = this.plugin.settings.webviewllm.auto_stop.split('\n');
			outer: for (const pattern of patterns) {
				const regex = new RegExp(pattern.trim());
				if (regex.test(rsp.trim())) {
					this.auto_chat = false;
					break outer;
				}
			}
			rsp = `${llm.name}_${idx}:\n${rsp}`;
			prevs.push(rsp);
			prevs = prevs.slice(-this.llms.length + 1);
			idx = idx + 1;
			if (idx == this.llms.length) {
				idx = 0;
			}
			llm = this.llms[idx];
			rsp = (await llm.request(prevs.join('\n\n---\n\n'))) ?? '';
		}
		this.auto_chat = false;
	}

	async get_last_active_llm() {
		await this.cmd_refresh_llms();
		const llm = this.llms.sort(
			(a: any, b: any) => b.view.leaf.activeTime - a.view.leaf.activeTime
		)[0];
		return llm;
	}

}
