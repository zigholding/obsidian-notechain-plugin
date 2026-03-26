import { App } from 'obsidian';

import { kimiProfile } from './LLMProfiles';
import { SelectorDrivenWebViewer } from './SelectorDrivenWebViewer';

export class Kimi extends SelectorDrivenWebViewer {
	constructor(app: App,homepage='https://www.kimi.com/') {
		super(app, homepage,'Kimi', kimiProfile);
	}


	async request(ctx:string,timeout=60): Promise<string> {
		const res = await super.request(ctx, timeout);
		const text = typeof res === 'string' ? res : '';
		if (text.includes('当前长文本对话已达20轮')) {
			await this.new_chat();
			return this.request(ctx, timeout);
		}
		return text;
	}

}
