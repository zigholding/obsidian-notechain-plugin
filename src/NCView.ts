import { ItemView, WorkspaceLeaf,MarkdownRenderer } from 'obsidian';

import NoteChainPlugin from "../main";

export class NoteContentView extends ItemView {
	content: string;
    plugin: NoteChainPlugin;
    sourcePath: string;

	constructor(leaf: WorkspaceLeaf, plugin: NoteChainPlugin) {
		super(leaf);
		this.plugin = plugin;
        this.icon = 'activity';
	}


	getViewType() {
		return 'note-content-view';
	}

	getDisplayText() {
		return 'Note Preview'; 
	}

    getIcon(){
        return this.icon;
    }


	async onOpen() {
		const container = this.containerEl.children[1];
		container.empty();
		const div = container.createDiv();
		div.addClass('markdown-rendered');
		MarkdownRenderer.render(this.app, "这里是内容", div, '', this);
	}

	async setContent(content: string, sourcePath: string) {
		const container = this.containerEl.children[1];
		container.empty();
		const div = container.createDiv();
		div.addClass('markdown-rendered');
		MarkdownRenderer.render(this.app, content, div, sourcePath, this);
	}
}
