import { ItemView, WorkspaceLeaf, MarkdownRenderer, TFile } from 'obsidian';
import NoteChainPlugin from "../main";

export class NoteContentView extends ItemView {
	content: string;
	plugin: NoteChainPlugin;
	sourcePath: string;

	constructor(leaf: WorkspaceLeaf, plugin: NoteChainPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.icon = 'getIcon';
	}

	getViewType() {
		return 'note-content-view';
	}

	getDisplayText() {
		return 'Note Preview'; 
	}

	getIcon() {
		return '';
	}

	async onOpen() {
		const container = this.containerEl.children[1];
		container.empty();
		const div = container.createDiv();
		div.addClass('markdown-rendered');

		// 链接点击处理
		div.addEventListener('click', async (e) => {
			const target = e.target as HTMLElement;
			if (target.tagName === 'A' && target.hasClass('internal-link')) {
				e.preventDefault();
				const link = target.getAttr('href');
				if (link) {
					this.app.workspace.openLinkText(link, this.sourcePath, true);
				}
			}
		});

		MarkdownRenderer.render(this.app, "这里是内容", div, '', this);
	}

	async setContent(content: string, sourcePath: string) {
		this.content = content;
		this.sourcePath = sourcePath;

		const container = this.containerEl.children[1];
		container.empty();
		const div = container.createDiv();
		div.addClass('markdown-rendered');

		// 链接点击处理
		div.addEventListener('click', async (e) => {
			const target = e.target as HTMLElement;
			if (target.tagName === 'A' && target.hasClass('internal-link')) {
				e.preventDefault();
				const link = target.getAttr('href');
				if (link) {
					this.app.workspace.openLinkText(link, this.sourcePath, true);
				}
			}
		});

		await MarkdownRenderer.render(this.app, content, div, sourcePath, this);

		// 注册文件变化监听
		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (file instanceof TFile) {
			this.registerEvent(
				this.app.vault.on('modify', (modifiedFile:TFile) => {
					if (modifiedFile.path === sourcePath) {
						this.app.vault.read(modifiedFile).then((newContent) => {
							this.setContent(newContent, sourcePath);
						});
					}
				})
			);
		}
	}
}
