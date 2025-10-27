import { ItemView, WorkspaceLeaf, MarkdownRenderer, TFile,ViewStateResult,EventRef, Menu} from 'obsidian';
import NoteChainPlugin from "../main";

export class NoteContentView extends ItemView {
	content: string;
	plugin: NoteChainPlugin;
	sourcePath: string;
	private fileModifyHandler: EventRef | null = null;
	private debounceTimer: number | null = null;
	private noteIcon: string = '';

	constructor(leaf: WorkspaceLeaf, plugin: NoteChainPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.icon = 'puzzle';
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
			sourcePath: this.sourcePath,
			noteIcon: this.noteIcon
		};
	}
	
	async setState(state: any, result: ViewStateResult): Promise<void> {
		this.content = state.content;
		this.sourcePath = state.sourcePath;
		this.noteIcon = state.noteIcon || '';
	
		await this.setContent(this.content, this.sourcePath);
	}

	getIcon() {
		return this.noteIcon || '';
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
		this.noteIcon = '';
		if (sourcePath) {
			const file = this.app.vault.getAbstractFileByPath(sourcePath);
			if (file instanceof TFile) {
				const iconFromFrontmatter = this.plugin.editor.get_frontmatter(file, 'icon');
				if (iconFromFrontmatter && typeof iconFromFrontmatter === 'string') {
					this.noteIcon = iconFromFrontmatter;
				}
			}
		}

		const isDatacoreContent = Boolean(sourcePath && (sourcePath.endsWith('.canvas') || sourcePath.endsWith('.base')) && 
			('datacore' in (this.plugin.app as any).plugins.plugins));

		if(sourcePath && (sourcePath.endsWith('.canvas') || sourcePath.endsWith('.base'))){
            if('datacore' in (this.plugin.app as any).plugins.plugins){
                content = `
\`\`\`datacorejsx
return (
    <dc.Markdown
        content="![[${sourcePath}]]"
    />
);
\`\`\`
                `.trim()
            }else if('dataview' in (this.plugin.app as any).plugins.plugins){
                content = `
\`\`\`dataviewjs
dv.span(\`![[${sourcePath}]]\`);
\`\`\`
                `.trim()
            }
        }
		
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
        
		this.setupInternalLinks(div, isDatacoreContent);
        

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
								// 更新图标
								this.updateIcon();
							});
							this.debounceTimer = null;
						}, 5000); // 5秒防抖
					}
				})
			);
		}
		
		// 更新图标显示
		this.updateIcon();
	}

	private setupInternalLinks(div: HTMLElement, isDatacoreContent: boolean) {
		setTimeout(() => {
			this.processInternalLinks(div);
		}, 100);
		const observer = new MutationObserver((mutations) => {
			let shouldProcess = false;
			for (const mutation of mutations) {
				if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
					for (let i = 0; i < mutation.addedNodes.length; i++) {
						const node = mutation.addedNodes[i];
						if (node.nodeType === Node.ELEMENT_NODE) {
							const element = node as HTMLElement;
							if (element.querySelectorAll('a.internal-link').length > 0 || 
								element.tagName === 'A' && element.hasClass('internal-link')) {
								shouldProcess = true;
								break;
							}
						}
					}
				}
			}
			
			if (shouldProcess) {
				setTimeout(() => {
					this.processInternalLinks(div);
				}, 100);
			}
		});
		
		observer.observe(div, {
			childList: true,
			subtree: true
		});
		
		setTimeout(() => {
			observer.disconnect();
		}, 10000);
		
		let attempts = 0;
		const maxAttempts = 10;
		const pollInterval = setInterval(() => {
			attempts++;
			this.processInternalLinks(div);
			
			if (attempts >= maxAttempts) {
				clearInterval(pollInterval);
			}
		}, 1000);
	}

	private processInternalLinks(div: HTMLElement) {
		const links = div.querySelectorAll('a.internal-link');
		
		links.forEach((el) => {
			if (el.hasClass('nc-processed')) {
				return;
			}
			
			const href = el.getAttribute('href');
			if (href) {
				el.setAttribute('data-href', href);
				el.setAttr('aria-label', href);
				el.addClass('hover-link');
				el.addClass('nc-processed');

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

				el.addEventListener('contextmenu', (e: MouseEvent) => {
					e.preventDefault();
					e.stopPropagation();
					
					const targetFile = this.app.metadataCache.getFirstLinkpathDest(href, this.sourcePath);
					if (targetFile) {
						const menu = new Menu();
						this.app.workspace.trigger('file-menu', menu, targetFile, 'note-content-view', this.leaf);
						menu.showAtPosition({ x: e.clientX, y: e.clientY });
					}
				});
			}
		});
	}

	private updateIcon() {
		// 更新视图的图标显示
		if (this.noteIcon) {
			this.icon = this.noteIcon;
		} else {
			this.icon = '';
		}
		// 触发视图更新
		this.app.workspace.requestSaveLayout();
	}

	async onClose(): Promise<void> {
		// 注销事件监听
		if (this.fileModifyHandler) {
			this.app.vault.offref(this.fileModifyHandler);
			this.fileModifyHandler = null;
		}
	}
}
