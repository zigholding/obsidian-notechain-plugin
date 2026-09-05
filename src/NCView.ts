import { ItemView, WorkspaceLeaf, MarkdownRenderer, TFile,ViewStateResult,EventRef, Menu} from 'obsidian';
import NoteChainPlugin from "./plugin";
import { getWebViewerPartition, installWebviewTlsTrust, isNoteChainServerUrl, toWebViewerUrl } from './server/tlsWebviewTrust';
import { hasCommunityPlugin, isMobileApp, obsidianApp } from './obsidian-app';

export class NoteContentView extends ItemView {
	content: string;
	plugin: NoteChainPlugin;
	sourcePath: string;
	private fileModifyHandler: EventRef | null = null;
	private debounceTimer: number | null = null;
	private noteIcon: string = '';
	private displayText: string = 'Note Preview';
	private webUrl: string = '';
	private webviewEl: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: NoteChainPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.icon = 'puzzle';
	}

	getViewType() {
		return 'note-content-view';
	}

	getDisplayText() {
		return this.displayText; 
	}

	getState(): Record<string, unknown> {
		return {
			content: this.content,
			sourcePath: this.sourcePath,
			webUrl: this.webUrl,
			noteIcon: this.noteIcon,
			displayText: this.displayText
		};
	}
	
	async setState(state: Record<string, unknown>, result: ViewStateResult): Promise<void> {
		this.content = typeof state.content === 'string' ? state.content : this.content;
		this.sourcePath = typeof state.sourcePath === 'string' ? state.sourcePath : this.sourcePath;
		this.webUrl = typeof state.webUrl === 'string' ? state.webUrl : '';
		this.noteIcon = typeof state.noteIcon === 'string' ? state.noteIcon : '';
		this.displayText = typeof state.displayText === 'string' ? state.displayText : 'Note Preview';
	
		await this.setContent(this.content, this.sourcePath, this.webUrl);
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
					void this.app.workspace.openLinkText(link, this.sourcePath, true);
				}
			}
		});

		await MarkdownRenderer.render(this.app, "", div, '', this);
	}

	async setContent(content: string, sourcePath: string, webUrl = '') {
		this.webUrl = webUrl;
		if (this.webUrl) {
			this.content = '';
			this.sourcePath = '';
			if (!this.noteIcon) {
				this.noteIcon = 'globe';
			}
			if (!this.displayText || this.displayText === 'Note Preview') {
				try {
					this.displayText = new URL(this.webUrl).hostname;
				} catch {
					this.displayText = this.webUrl;
				}
			}

			this.renderWebUrl(this.containerEl.children[1] as HTMLElement, this.webUrl);
			this.updateIcon();
			return;
		}

		let cssClasses: unknown = null;
		if (sourcePath) {
			const cfile = this.plugin.easyapi.file.get_tfile(sourcePath);
			if (cfile) {
				cssClasses = this.plugin.editor.get_frontmatter(cfile, 'cssClasses');
			}
		}
		this.noteIcon = '';
		if (sourcePath) {
			const file = this.app.vault.getAbstractFileByPath(sourcePath);
			if (file instanceof TFile) {
				// 设置显示文本为文件名（不含扩展名）
				this.displayText = file.basename;
				const iconFromFrontmatter = this.plugin.editor.get_frontmatter(file, 'icon');
				if (iconFromFrontmatter && typeof iconFromFrontmatter === 'string') {
					this.noteIcon = iconFromFrontmatter;
				}

				const displayTextFromFrontmatter = this.plugin.editor.get_frontmatter(file, 'display');
				if (displayTextFromFrontmatter && typeof displayTextFromFrontmatter === 'string') {
					this.displayText = displayTextFromFrontmatter;
				}
			} else {
				// 如果不是文件，使用路径的最后一部分作为显示文本
				this.displayText = sourcePath.split('/').pop() || 'Note Preview';
			}
		} else {
			// 如果没有路径，使用默认文本
			this.displayText = 'Note Preview';
		}

		const isDatacoreContent = Boolean(sourcePath && (sourcePath.endsWith('.canvas') || sourcePath.endsWith('.base')) && 
			hasCommunityPlugin(this.plugin.app, 'datacore'));

		if(sourcePath && (sourcePath.endsWith('.canvas') || sourcePath.endsWith('.base'))){
            if(hasCommunityPlugin(this.plugin.app, 'datacore')){
                content = `
\`\`\`datacorejsx
return (
    <dc.Markdown
        content="![[${sourcePath}]]"
    />
);
\`\`\`
                `.trim()
            }else if(hasCommunityPlugin(this.plugin.app, 'dataview')){
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
		// Apply frontmatter `cssClasses` to the markdown root element,
		// so CSS selectors defined in the note can match this view.
		const normalizedCssClasses =
			typeof cssClasses === 'string'
				? cssClasses.split(/[\s,]+/).filter(Boolean)
				: Array.isArray(cssClasses)
					? cssClasses.filter((x) => typeof x === 'string' && x.trim().length > 0)
					: [];
		normalizedCssClasses.forEach((c) => div.addClass(c));

        await MarkdownRenderer.render(this.app, content, div, sourcePath, this);

		
		// 链接点击处理
		div.addEventListener('click', async (e) => {
			const target = e.target as HTMLElement;
			if (target.tagName === 'A' && target.hasClass('internal-link')) {
				e.preventDefault();
				const link = target.getAttr('href');
				if (link) {
					void this.app.workspace.openLinkText(link, this.sourcePath, true);
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
							void this.app.vault.read(modifiedFile).then((newContent) => {
								void this.setContent(newContent, sourcePath);
								this.updateIcon();
							}).catch(() => { /* read failed */ });
							this.debounceTimer = null;
						}, 5000); // 5秒防抖
					}
				})
			);
		}
		
		// 更新图标显示
		this.updateIcon();
	}

	/** Obsidian WebViewer 使用的 Electron session partition，共享 Cookie / 登录态。 */
	private getWebViewerPartition(): string {
		return getWebViewerPartition(this.app);
	}

	private isWebViewerPluginEnabled(): boolean {
		return !!obsidianApp(this.app).internalPlugins?.getEnabledPluginById?.('webviewer');
	}

	private canUseWebViewerWebview(): boolean {
		return !isMobileApp(this.app) && this.isWebViewerPluginEnabled();
	}

	private renderWebUrl(container: HTMLElement, url: string) {
		container.empty();
		this.webviewEl = null;
		container.addClass('nc-note-content-web-host');

		const port = this.plugin.settings?.notechain?.httpServerPort ?? 3000;
		const nc = this.plugin.settings?.notechain;
		const tlsDir = this.plugin.httpServer?.getTlsDir();
		const httpsAlsoOn = !!this.plugin.httpServer?.isHttpsRunning();
		let loadUrl = url;
		if (
			this.plugin.httpServer?.isHttpRunning() &&
			nc?.httpServerHttpEnabled &&
			isNoteChainServerUrl(url, port, httpsAlsoOn)
		) {
			loadUrl = toWebViewerUrl(url, port, httpsAlsoOn);
		}
		if (tlsDir && isNoteChainServerUrl(loadUrl, port, httpsAlsoOn)) {
			installWebviewTlsTrust(this.getWebViewerPartition(), port, tlsDir);
		}

		if (this.canUseWebViewerWebview()) {
			const webview = document.createElement('webview');
			webview.className = 'nc-note-content-webview';
			webview.setAttribute('src', loadUrl);
			webview.setAttribute('partition', this.getWebViewerPartition());
			webview.setAttribute('allowpopups', 'true');
			container.appendChild(webview);
			this.webviewEl = webview;
			return;
		}

		const iframe = container.createEl('iframe', {
			cls: 'nc-note-content-webview',
			attr: {
				src: loadUrl,
				sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox',
			},
		});
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
		this.webviewEl = null;
		// 注销事件监听
		if (this.fileModifyHandler) {
			this.app.vault.offref(this.fileModifyHandler);
			this.fileModifyHandler = null;
		}
	}
}
