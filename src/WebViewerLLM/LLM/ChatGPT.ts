import { App, Notice } from 'obsidian';

import { chatGPTProfile } from './LLMProfiles';
import { SelectorDrivenWebViewer } from './SelectorDrivenWebViewer';

export class ChatGPT extends SelectorDrivenWebViewer {
	constructor(app: App, homepage = 'https://chatgpt.com') {
		super(app, homepage, 'ChatGPT', chatGPTProfile);
	}

}
