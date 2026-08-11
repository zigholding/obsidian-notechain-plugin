import { Notice, TFile } from 'obsidian';

import type NoteChainPlugin from '../plugin';
import { BaseWebViewer } from './LLM/BaseWebViewer';
import { DeepSeek } from './LLM/DeepSeek';
import { Doubao } from './LLM/Doubao';
import { Kimi } from './LLM/Kimi';
import { Yuanbao } from './LLM/Yuanbao';
import { ChatGPT } from './LLM/ChatGPT';
import { ChatGLM } from './LLM/ChatGLM';
import { Gemini } from './LLM/Gemini';
import { Claude } from './LLM/Claude';

import { WebViewerLLMRegistry } from './llmRegistry';
import { WebViewerLLMChatCommands } from './chatCommands';
import { WebViewerLLMChatWithTarget } from './chatWithTarget';
import { WebViewerLLMUiCommands } from './llmUiCommands';
import { WebViewerLLMTurndown } from './turndown';

/** YAML `turndown_styles` after defaults; list keys are string rule lines */
export interface WebViewerTurndownStylesNormalized {
	'pre-process': string[];
	script: string[];
	class: string[];
	'name+class': string[];
	'key+value': string[];
	'post-process': string[];
}

export interface WebViewerLLMModule extends
	WebViewerLLMRegistry,
	WebViewerLLMChatCommands,
	WebViewerLLMChatWithTarget,
	WebViewerLLMUiCommands,
	WebViewerLLMTurndown {}

export class WebViewerLLMModule {
	readonly plugin: NoteChainPlugin;

	llms: Array<BaseWebViewer>;
	basellms: Array<BaseWebViewer>;

	basewv: BaseWebViewer;
	deepseek: DeepSeek;
	doubao: Doubao;
	kimi: Kimi;
	yuanbao: Yuanbao;
	chatgpt: ChatGPT;
	chatglm: ChatGLM;
	gemini: Gemini;
	claude: Claude;

	auto_chat = true;

	constructor(plugin: NoteChainPlugin) {
		this.plugin = plugin;
		this.llms = [];
		this.doubao = new Doubao(this.app);
		this.kimi = new Kimi(this.app);
		this.yuanbao = new Yuanbao(this.app);
		this.chatgpt = new ChatGPT(this.app);
		this.chatglm = new ChatGLM(this.app);
		this.gemini = new Gemini(this.app);
		this.claude = new Claude(this.app);
		this.deepseek = new DeepSeek(this.app);
		this.basellms = [
			this.yuanbao,
			this.chatgpt,
			this.kimi,
			this.doubao,
			this.deepseek,
			this.chatglm,
			this.gemini,
			this.claude,
		];
		this.basewv = new BaseWebViewer(this.app, '');
	}
}

function applyMixins(derivedCtor: any, constructors: any[]) {
	constructors.forEach((baseCtor) => {
		Object.getOwnPropertyNames(baseCtor.prototype).forEach((name) => {
			if (name === 'constructor') return;
			Object.defineProperty(
				derivedCtor.prototype,
				name,
				Object.getOwnPropertyDescriptor(baseCtor.prototype, name) as PropertyDescriptor
			);
		});
	});
}

applyMixins(WebViewerLLMModule, [
	WebViewerLLMRegistry,
	WebViewerLLMChatCommands,
	WebViewerLLMChatWithTarget,
	WebViewerLLMUiCommands,
	WebViewerLLMTurndown,
]);
