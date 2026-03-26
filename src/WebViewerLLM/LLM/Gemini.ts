import { App } from 'obsidian';

import { geminiProfile } from './LLMProfiles';
import { SelectorDrivenWebViewer } from './SelectorDrivenWebViewer';

export class Gemini extends SelectorDrivenWebViewer {
	constructor(app: App, homepage = 'https://gemini.google.com/') {
		super(app, homepage, 'Gemini', geminiProfile);
	}
}
