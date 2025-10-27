import { ItemView, WorkspaceLeaf, MarkdownRenderer, TFile,ViewStateResult,EventRef} from 'obsidian';
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
		// 从frontmatter中读取icon字段
		console.log('????setContent sourcePath:',sourcePath);
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

		
		console.log('????sourcePath:',this.sourcePath);
        
		// ✅ 处理内部链接的 hover 效果
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
		console.log('????setupInternalLinks isDatacoreContent:', isDatacoreContent);
		
		// 延迟处理已存在的链接，给渲染一些时间
		setTimeout(() => {
			this.processInternalLinks(div);
		}, 100);
		
		// 使用 MutationObserver 监听所有渲染情况（不仅仅是 datacore）
		const observer = new MutationObserver((mutations) => {
			console.log('????MutationObserver triggered, mutations count:', mutations.length);
			let shouldProcess = false;
			for (const mutation of mutations) {
				if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
					console.log('????Added nodes:', mutation.addedNodes.length);
					// 检查是否有新的内部链接被添加
					for (let i = 0; i < mutation.addedNodes.length; i++) {
						const node = mutation.addedNodes[i];
						if (node.nodeType === Node.ELEMENT_NODE) {
							const element = node as HTMLElement;
							if (element.querySelectorAll('a.internal-link').length > 0 || 
								element.tagName === 'A' && element.hasClass('internal-link')) {
								console.log('????Found internal link in added node');
								shouldProcess = true;
								break;
							}
						}
					}
				}
			}
			
			if (shouldProcess) {
				console.log('????Processing internal links...');
				// 延迟处理，确保渲染完成
				setTimeout(() => {
					this.processInternalLinks(div);
				}, 100);
			}
		});
		
		// 开始观察
		observer.observe(div, {
			childList: true,
			subtree: true
		});
		
		// 设置超时停止观察（避免无限观察）
		setTimeout(() => {
			observer.disconnect();
			console.log('????Observer disconnected');
		}, 10000); // 10秒后停止观察
		
		// 定期轮询检查链接（作为备用方案）
		let attempts = 0;
		const maxAttempts = 10; // 最多尝试10次
		const pollInterval = setInterval(() => {
			attempts++;
			console.log('????Polling attempt:', attempts);
			this.processInternalLinks(div);
			
			if (attempts >= maxAttempts) {
				clearInterval(pollInterval);
				console.log('????Polling stopped');
			}
		}, 1000); // 每秒检查一次
	}

	private processInternalLinks(div: HTMLElement) {
		// ✅ 修复 Page Preview 不生效
		const links = div.querySelectorAll('a.internal-link');
		console.log('????processInternalLinks found', links.length, 'internal links');
		
		links.forEach((el) => {
			// 避免重复处理已经处理过的链接
			if (el.hasClass('nc-processed')) {
				console.log('????Link already processed');
				return;
			}
			
			const href = el.getAttribute('href');
			console.log('????Processing el:', el, 'href:', href);
			if (href) {
				console.log('href:', href);
				console.log('sourcePath:', this.sourcePath);
				el.setAttribute('data-href', href);
				el.setAttr('aria-label', href);
				el.addClass('hover-link'); // ✅ 核心
				el.addClass('nc-processed'); // 标记为已处理

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
