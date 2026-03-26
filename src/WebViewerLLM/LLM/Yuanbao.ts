import { App } from 'obsidian';

import { yuanbaoProfile } from './LLMProfiles';
import { SelectorDrivenWebViewer } from './SelectorDrivenWebViewer';

export class Yuanbao extends SelectorDrivenWebViewer {
    constructor(app: App,homepage='https://yuanbao.tencent.com/chat') {
		super(app, homepage,'元宝', yuanbaoProfile);
	}
}
