import { App } from 'obsidian';

import { chatGLMProfile } from './LLMProfiles';
import { SelectorDrivenWebViewer } from './SelectorDrivenWebViewer';

export class ChatGLM extends SelectorDrivenWebViewer {
    constructor(app: App,homepage='https://chatglm.cn/') {
		super(app, homepage,'智谱', chatGLMProfile);
	}
}
