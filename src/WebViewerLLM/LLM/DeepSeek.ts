import { App } from 'obsidian';
import { deepSeekProfile } from './LLMProfiles';
import { SelectorDrivenWebViewer } from './SelectorDrivenWebViewer';

export class DeepSeek extends SelectorDrivenWebViewer {
	constructor(app: App,homepage='https://chat.deepseek.com') {
		super(app, homepage,'DeepSeek', deepSeekProfile);
	}
}
