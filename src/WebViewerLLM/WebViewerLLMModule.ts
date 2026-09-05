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
import { applyMixins } from '../ts-helpers';

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
	WebViewerLLMModuleClass,
	WebViewerLLMRegistry,
	WebViewerLLMChatCommands,
	WebViewerLLMChatWithTarget,
	WebViewerLLMUiCommands,
	WebViewerLLMTurndown {}

class WebViewerLLMModuleClass {
	plugin: NoteChainPlugin;

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
		this.doubao = new Doubao(this.plugin.app);
		this.kimi = new Kimi(this.plugin.app);
		this.yuanbao = new Yuanbao(this.plugin.app);
		this.chatgpt = new ChatGPT(this.plugin.app);
		this.chatglm = new ChatGLM(this.plugin.app);
		this.gemini = new Gemini(this.plugin.app);
		this.claude = new Claude(this.plugin.app);
		this.deepseek = new DeepSeek(this.plugin.app);
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
		this.basewv = new BaseWebViewer(this.plugin.app, '');
	}
}

export const WebViewerLLMModule = WebViewerLLMModuleClass as {
	new (plugin: NoteChainPlugin): WebViewerLLMModule;
};

applyMixins(WebViewerLLMModuleClass, [
	WebViewerLLMRegistry,
	WebViewerLLMChatCommands,
	WebViewerLLMChatWithTarget,
	WebViewerLLMUiCommands,
	WebViewerLLMTurndown,
]);
