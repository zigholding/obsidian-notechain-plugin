import {
	App, Editor, MarkdownView, Modal, Notice,
	Plugin, PluginSettingTab, Setting, moment, MarkdownRenderer, Component,
	TAbstractFile,
	TFile, TFolder,
	MarkdownPostProcessorContext,
	MarkdownRenderChild,
	parseYaml,
} from 'obsidian';

import NoteChainPlugin from "./plugin";

/** textarea 内 `[[` 笔记待选浮窗 */
class TextareaWikiLinkSuggest extends MarkdownRenderChild {
	private allNoteNames: string[] = [];
	private linkSuggestions: string[] = [];
	private selectedSuggestionIndex = 0;
	private linkTriggerStart = -1;
	private suggestionEl!: HTMLDivElement;

	constructor(
		containerEl: HTMLElement,
		private area: HTMLTextAreaElement,
		private app: App
	) {
		super(containerEl);
	}

	onload() {
		this.area.setAttribute('data-nc-wikilink-suggest', '1');
		// 必须挂到 body：Live Preview 祖先常有 transform，fixed 会错位并被 overflow 裁掉
		this.suggestionEl = document.body.createDiv({
			cls: 'nc-textarea-inline-suggest',
		});

		this.cacheNoteNames();
		this.registerDomEvent(this.area, 'input', this.onSuggestTrigger);
		this.registerDomEvent(this.area, 'compositionend', this.onSuggestTrigger);
		this.registerDomEvent(this.area, 'click', this.onSuggestTrigger);
		this.registerDomEvent(this.area, 'keyup', this.onSuggestTrigger);
		this.registerDomEvent(this.area, 'keydown', this.onKeyDown);
		this.registerDomEvent(window, 'resize', this.onReposition);
		this.registerDomEvent(window, 'scroll', this.onReposition, { capture: true });
	}

	onunload() {
		this.closeSuggestionList();
		this.suggestionEl?.remove();
	}

	private cacheNoteNames = () => {
		this.allNoteNames = this.app.vault
			.getMarkdownFiles()
			.sort((a: TFile, b: TFile) => a.basename.localeCompare(b.basename))
			.map((file: TFile) => file.basename);
	};

	private onSuggestTrigger = () => this.updateInlineSuggestions();

	private onReposition = () => {
		if (this.linkSuggestions.length > 0) this.positionSuggestionList();
	};

	private closeSuggestionList = () => {
		this.linkSuggestions = [];
		this.selectedSuggestionIndex = 0;
		this.linkTriggerStart = -1;
		if (!this.suggestionEl) return;
		this.suggestionEl.empty();
		this.suggestionEl.removeClass('is-open');
	};

	private positionSuggestionList = () => {
		if (this.linkSuggestions.length === 0) return;
		const inputRect = this.area.getBoundingClientRect();
		const viewportPadding = 8;
		const gap = 6;
		const spaceBelow = window.innerHeight - inputRect.bottom - viewportPadding;
		const spaceAbove = inputRect.top - viewportPadding;
		const preferAbove = spaceBelow < 180 && spaceAbove > spaceBelow;
		const available = preferAbove ? spaceAbove : spaceBelow;
		const maxHeight = Math.max(120, Math.min(360, available - gap));
		const top = preferAbove
			? Math.max(viewportPadding, inputRect.top - maxHeight - gap)
			: inputRect.bottom + gap;

		Object.assign(this.suggestionEl.style, {
			left: `${Math.max(viewportPadding, inputRect.left)}px`,
			top: `${top}px`,
			width: `${Math.max(160, inputRect.width)}px`,
			maxHeight: `${maxHeight}px`,
		});
	};

	private renderSuggestionList = () => {
		this.suggestionEl.empty();
		if (this.linkSuggestions.length === 0) {
			this.closeSuggestionList();
			return;
		}
		this.suggestionEl.addClass('is-open');
		this.positionSuggestionList();

		this.linkSuggestions.forEach((name, index) => {
			const itemEl = this.suggestionEl.createDiv({
				cls: `nc-textarea-inline-suggest-item${index === this.selectedSuggestionIndex ? ' is-selected' : ''}`,
				text: name,
			});
			itemEl.addEventListener('mousedown', (evt) => {
				evt.preventDefault();
				this.applySuggestion(index);
			});
		});
	};

	private moveSuggestionSelection = (step: number) => {
		if (!this.linkSuggestions.length) return;
		const size = this.linkSuggestions.length;
		this.selectedSuggestionIndex =
			((this.selectedSuggestionIndex + step) % size + size) % size;
		this.renderSuggestionList();
	};

	private applySuggestion = (index: number) => {
		const selected = this.linkSuggestions[index];
		if (!selected) return;
		const cursor = this.area.selectionStart ?? this.area.value.length;
		const before = this.area.value.slice(0, this.linkTriggerStart);
		const after = this.area.value.slice(cursor);
		const inserted = `[[${selected}]]`;
		this.area.value = `${before}${inserted}${after}`;
		const nextCursor = before.length + inserted.length;
		this.area.setSelectionRange(nextCursor, nextCursor);
		this.area.focus();
		this.area.dispatchEvent(new Event('input', { bubbles: true }));
		this.closeSuggestionList();
	};

	private normalizeWikiLinkTrigger = (): number => {
		const cursor = this.area.selectionStart ?? this.area.value.length;
		const normalize = (value: string) =>
			value
				.replace(/(?:\[|【){2,}/g, '[[')
				.replace(/(?:\]|】){2,}/g, ']]');
		const normalizedValue = normalize(this.area.value);
		if (normalizedValue === this.area.value) return cursor;
		const nextCursor = normalize(this.area.value.slice(0, cursor)).length;
		this.area.value = normalizedValue;
		this.area.setSelectionRange(nextCursor, nextCursor);
		return nextCursor;
	};

	private updateInlineSuggestions = () => {
		const cursor = this.normalizeWikiLinkTrigger();
		const textBeforeCursor = this.area.value.slice(0, cursor);
		const linkMatch = textBeforeCursor.match(/\[\[([^\]\n]*)$/);
		if (!linkMatch) {
			this.closeSuggestionList();
			return;
		}
		this.cacheNoteNames();
		const query = (linkMatch[1] ?? '').trim().toLowerCase();
		this.linkTriggerStart = cursor - linkMatch[0].length;
		const candidates = this.allNoteNames.filter((name) =>
			query.length === 0 ? true : name.toLowerCase().includes(query)
		);
		this.linkSuggestions = candidates.slice(0, 12);
		this.selectedSuggestionIndex = 0;
		this.renderSuggestionList();
	};

	private onKeyDown = (evt: KeyboardEvent) => {
		if (this.linkSuggestions.length === 0) return;
		if (evt.key === 'ArrowDown') {
			evt.preventDefault();
			evt.stopPropagation();
			this.moveSuggestionSelection(1);
			return;
		}
		if (evt.key === 'ArrowUp') {
			evt.preventDefault();
			evt.stopPropagation();
			this.moveSuggestionSelection(-1);
			return;
		}
		if (evt.key === 'Enter' || evt.key === 'Tab') {
			evt.preventDefault();
			evt.stopPropagation();
			this.applySuggestion(this.selectedSuggestionIndex);
			return;
		}
		if (evt.key === 'Escape') {
			evt.preventDefault();
			evt.stopPropagation();
			this.closeSuggestionList();
		}
	};
}

export class NCTextarea {
	yamljs = { load: (src: string) => parseYaml(src) };
	plugin: NoteChainPlugin;
	app: App;

	constructor(plugin: NoteChainPlugin) {
		this.plugin = plugin;
		this.app = plugin.app;
		void this.registerMarkdownCodeBlockProcessor()
	}

	arrayBufferToBase64(buffer: ArrayBuffer) {
		let binary = '';
		let bytes = new Uint8Array(buffer);
		let len = bytes.byteLength;
		for (let i = 0; i < len; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		return window.btoa(binary);
	}
	async registerMarkdownCodeBlockProcessor(field = 'textarea') {
		let nc = this.plugin
		nc.registerMarkdownCodeBlockProcessor(field, async (
			source: string,
			el: HTMLElement,
			ctx: MarkdownPostProcessorContext
		) => {
			source = source.trim()
			let config: any;
			if (source == '') {
				config = {}
			} else {
				config = nc.textarea.yamljs.load(source);
			}
			let tfile = nc.easyapi.file.get_tfile(ctx.sourcePath);
			if(tfile && config['frontmatter'] != false){
				let frontmatter = (nc.app as any).metadataCache.getFileCache(tfile)['frontmatter'];
				if(frontmatter){
					for(let key in frontmatter){
						config[key] = frontmatter[key];
					}
				}
			}
			
			let container = el.createEl("div", { cls: 'textarea-container' });
			// Online 预览：块内保存 source，按钮带 data-nc-online-fname，由浏览器端委托点击并调 /online/api/textarea-exec
			let metaSrc = container.createEl('textarea', {
				cls: 'nc-ta-block-meta',
				attr: { readonly: 'readonly', tabindex: '-1', 'aria-hidden': 'true' },
			});
			metaSrc.value = source;

			let area: any = null;
			if (config['textarea'] != false) {
				let cls = 'code_block_textarea'
				if (config.textarea?.cls) {
					cls = config['textarea']['cls']
				}
				area = container.createEl("textarea", { cls: cls });
				let style = config.textarea?.style
				if (style && typeof (style) == 'object') {
					for (let name in style) {
						if (name == 'backgroundImage') {
							let img = nc.easyapi.file.get_tfile(style[name])
							if (img) {
								let data = await nc.app.vault.readBinary(img)
								let text = this.arrayBufferToBase64(data);
								let bs64 = `data:image/png;base64,${text}`;
								(area as any).style[name] = `url('${bs64}')`
								continue
							}
						}
						(area as any).style[name] = style[name];
					}
				}
			}
			for (let k in config) {
				if (k.startsWith('buttons')) {
					let btns = config[k];
					if (btns && Array.isArray(btns)) {
						// 创建一个按钮容器
						let buttonContainer = container.createEl("div", { cls: 'code_block_textarea_btn_container' });

						const applyBtnStyle = async (xbtn: HTMLButtonElement, style: any) => {
							if (!style || typeof (style) != 'object') { return }
							for (let name in style) {
								if (name == 'cls') { continue }
								if (name == 'backgroundImage') {
									let img = nc.easyapi.file.get_tfile(style[name])
									if (img) {
										let data = await nc.app.vault.readBinary(img)
										let text = this.arrayBufferToBase64(data);
										let bs64 = `data:image/png;base64,${text}`;
										let url = "url('" + bs64 + "')";
										(xbtn as any).style.backgroundImage = url;
										xbtn.addClass('nc-ta-btn-has-bg');
										continue
									}
								}
								(xbtn as any).style[name] = style[name];
							}
						}

						for (let btn of btns) {
							let name = btn[0]
							let fname = btn[1]
							if (!name || !fname) { continue }

							let cls = 'code_block_textarea_btn'
							let btnStyle: any = null;
							if (btn[2]) {
								if (typeof (btn[2]) == 'string') {
									cls = btn[2]
								} else if (typeof (btn[2]) == 'object') {
									if (btn[2].cls) {
										cls = btn[2].cls
									}
									btnStyle = btn[2]
								}
							}
							// 库自带函数
							let ufunc = (nc.textarea as any)[fname];
							if (!ufunc) {
								// customJS/templater函数
								ufunc = await nc.utils.get_str_func(nc.app, fname);
							}
							if (ufunc) {
								let xbtn = buttonContainer.createEl('button', { text: name, cls: cls });
								xbtn.type = 'button';
								xbtn.setAttribute('data-nc-online-fname', String(fname));
								if (btn[3] !== undefined && btn[3] !== null) {
									try {
										xbtn.setAttribute('data-nc-online-params', JSON.stringify(btn[3]));
									} catch {
										// ignore
									}
								}
								if (btnStyle) {
									await applyBtnStyle(xbtn, btnStyle);
								}
								xbtn.addEventListener('click', () => {
									void Promise.resolve(ufunc(area, source, el, ctx));
								});
								continue
							}

							// 命令
							let c = (nc.app as any).commands?.findCommand(fname);
							if (c) {
								let xbtn = buttonContainer.createEl('button', { text: name, cls: cls });
								xbtn.type = 'button';
								xbtn.setAttribute('data-nc-online-fname', String(fname));
								if (btn[3] !== undefined && btn[3] !== null) {
									try {
										xbtn.setAttribute('data-nc-online-params', JSON.stringify(btn[3]));
									} catch {
										// ignore
									}
								}
								if (btnStyle) {
									await applyBtnStyle(xbtn, btnStyle);
								}
								xbtn.addEventListener('click', () => {
									void (nc.app as any).commands.executeCommandById(fname);
								});
								continue
							}

							let tfile = nc.easyapi.file.get_tfile(fname)
							if (tfile) {
								let xbtn = buttonContainer.createEl('button', { text: name, cls: cls });
								xbtn.type = 'button';
								xbtn.setAttribute('data-nc-online-fname', String(fname));
								if (btn[3] !== undefined && btn[3] !== null) {
									try {
										xbtn.setAttribute('data-nc-online-params', JSON.stringify(btn[3]));
									} catch {
										// ignore
									}
								}
								if (btnStyle) {
									await applyBtnStyle(xbtn, btnStyle);
								}
								xbtn.addEventListener('click', () => {
									let tags = nc.easyapi.file.get_tags(tfile).map(x=>x.slice(1)).filter(
										x=>nc.settings.notechain.tpl_tags_folder.contains(x)
									);
									if(tags.length>0){
										let tplExtra: any = {
											area: area,
											source: source,
											el: el,
											ctx: ctx,
											params: btn[3],
										};
										Object.defineProperty(tplExtra, 'textareaValue', {
											configurable: true,
											enumerable: true,
											get() {
												return area ? String((area as HTMLTextAreaElement).value) : '';
											},
											set(v: string) {
												if (area) {
													(area as HTMLTextAreaElement).value = String(v);
												}
											},
										});
										Object.defineProperty(tplExtra, 'text', {
											configurable: true,
											enumerable: true,
											get() {
												return area ? String((area as HTMLTextAreaElement).value) : '';
											},
											set(v: string) {
												if (area) {
													(area as HTMLTextAreaElement).value = String(v);
												}
											},
										});
										void nc.easyapi.tpl.parse_templater(fname, true, tplExtra);
									}else{
										void nc.chain.open_note_in_modal(tfile.path);
									}
								});
								continue
							}
						}
						container.appendChild(buttonContainer);
					}
				}
			}

			if (area) {
				ctx.addChild(new TextareaWikiLinkSuggest(container, area, nc.app));
			}
			if (area && config['focus'] != false) {
				area.focus()
			}
		});
	}

	clear_area(area: HTMLTextAreaElement) {
		area.value = '';
	}

	copy_area(area: HTMLTextAreaElement) {
		area.select();
		void navigator.clipboard.writeText(area.value);
	}

	log_area(area: HTMLTextAreaElement) {
		new Notice(area.value || '');
	}
}

