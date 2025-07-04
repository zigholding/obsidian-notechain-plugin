import { ItemView, WorkspaceLeaf, MarkdownRenderer, TFile,ViewStateResult,EventRef} from 'obsidian';
import NoteChainPlugin from "../main";

export class NoteContentView extends ItemView {
	content: string;
	plugin: NoteChainPlugin;
	sourcePath: string;
	private fileModifyHandler: EventRef | null = null;
	private debounceTimer: number | null = null;

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

	getState(): any {
		return {
			content: this.content,
			sourcePath: this.sourcePath
		};
	}
	
	async setState(state: any, result: ViewStateResult): Promise<void> {
		this.content = state.content;
		this.sourcePath = state.sourcePath;
	
		await this.setContent(this.content, this.sourcePath);
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

		MarkdownRenderer.render(this.app, "", div, '', this);
	}

	async setContent(content: string, sourcePath: string) {
		this.content = content;
		this.sourcePath = sourcePath;

		const container = this.containerEl.children[1];
		container.empty();
		const div = container.createDiv();
		div.addClass('markdown-rendered');

        await MarkdownRenderer.render(this.app, content, div, sourcePath, this);

		
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

		

        // ✅ 修复 Page Preview 不生效
        div.querySelectorAll('a.internal-link').forEach((el) => {
            const href = el.getAttribute('href');
            if (href) {
                el.setAttribute('data-href', href);
                el.setAttr('aria-label', href);
                el.addClass('hover-link'); // ✅ 核心
        
				el.addEventListener('mouseenter', (e) => {
					this.app.workspace.trigger("hover-link", {
						event: e,
						source: 'markdown',
						hoverParent: el,
						targetEl: el,
						linktext: href,
						sourcePath: this.sourcePath,
					});
				});
            }
        });
        

		// ✅ 文件变化监听
		if (this.fileModifyHandler) {
			this.app.vault.offref(this.fileModifyHandler);
			this.fileModifyHandler = null;
		}
		
		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (file instanceof TFile) {
			this.registerEvent(
				this.app.vault.on('modify', (modifiedFile: TFile) => {
					if (modifiedFile.path === sourcePath) {
						if (this.debounceTimer) {
							window.clearTimeout(this.debounceTimer);
						}
						this.debounceTimer = window.setTimeout(() => {
							this.app.vault.read(modifiedFile).then((newContent) => {
								this.setContent(newContent, sourcePath);
							});
							this.debounceTimer = null;
						}, 5000); // 5秒防抖
					}
				})
			);
		}
	}

	async onClose(): Promise<void> {
		// 注销事件监听
		if (this.fileModifyHandler) {
			this.app.vault.offref(this.fileModifyHandler);
			this.fileModifyHandler = null;
		}
	}
}
