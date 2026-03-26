import { App } from 'obsidian';

import { doubaoProfile } from './LLMProfiles';
import { SelectorDrivenWebViewer } from './SelectorDrivenWebViewer';

export class Doubao extends SelectorDrivenWebViewer {
    constructor(app: App,homepage='https://www.doubao.com') {
		super(app, homepage,'豆包', doubaoProfile);
	}
}
