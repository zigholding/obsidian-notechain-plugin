import { App } from 'obsidian';

import { claudeProfile } from './LLMProfiles';
import { SelectorDrivenWebViewer } from './SelectorDrivenWebViewer';

export class Claude extends SelectorDrivenWebViewer {
	constructor(app: App, homepage = 'https://claude.ai/') {
		super(app, homepage, 'Claude', claudeProfile);
	}
}
