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
import { encodeOctets } from "./easyapi/octetText";
import { obsidianApp } from "./obsidian-app";
import { isRecord } from "./ts-helpers";

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
		return encodeOctets(buffer);
	}
	async registerMarkdownCodeBlockProcessor(field = 'textarea') {
		let nc = this.plugin
		nc.registerMarkdownCodeBlockProcessor(field, async (
			source: string,
			el: HTMLElement,
			ctx: MarkdownPostProcessorContext
		) => {
			source = source.trim()
			let config: Record<string, unknown> = {};
			if (source != '') {
				const loaded = nc.textarea.yamljs.load(source);
				if (isRecord(loaded)) config = loaded;
			}
			let tfile = nc.easyapi.file.get_tfile(ctx.sourcePath);
			if(tfile && config['frontmatter'] != false){
				let frontmatter = nc.app.metadataCache.getFileCache(tfile)?.frontmatter;
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

			let area: HTMLTextAreaElement | null = null;
			if (config['textarea'] != false) {
				let cls = 'code_block_textarea'
				const taCfg = isRecord(config.textarea) ? config.textarea : undefined;
				if (typeof taCfg?.cls === 'string') {
					cls = taCfg.cls
				}
				area = container.createEl("textarea", { cls: cls });
				let style = taCfg?.style
				if (isRecord(style)) {
					for (let name of Object.keys(style)) {
						if (name == 'backgroundImage') {
							let img = nc.easyapi.file.get_tfile(typeof style[name] === 'string' ? style[name] : null)
							if (img) {
								let data = await nc.app.vault.readBinary(img)
								let text = this.arrayBufferToBase64(data);
								let bs64 = `data:image/png;base64,${text}`;
								(area.style as unknown as Record<string, string>)[name] = `url('${bs64}')`
								continue
							}
						}
						(area.style as unknown as Record<string, string>)[name] = String(style[name] ?? '');
					}
				}
			}
			for (let k in config) {
				if (k.startsWith('buttons')) {
					let btns = config[k];
					if (btns && Array.isArray(btns)) {
						// 创建一个按钮容器
						let buttonContainer = container.createEl("div", { cls: 'code_block_textarea_btn_container' });

						const applyBtnStyle = async (xbtn: HTMLButtonElement, style: unknown) => {
							if (!isRecord(style)) { return }
							for (let name of Object.keys(style)) {
								if (name == 'cls') { continue }
								if (name == 'backgroundImage') {
									let img = nc.easyapi.file.get_tfile(typeof style[name] === 'string' ? style[name] : null)
									if (img) {
										let data = await nc.app.vault.readBinary(img)
										let text = this.arrayBufferToBase64(data);
										let bs64 = `data:image/png;base64,${text}`;
										let url = "url('" + bs64 + "')";
										xbtn.style.backgroundImage = url;
										xbtn.addClass('nc-ta-btn-has-bg');
										continue
									}
								}
								(xbtn.style as unknown as Record<string, string>)[name] = String(style[name] ?? '');
							}
						}

						for (let btn of btns) {
							if (!Array.isArray(btn) || btn.length < 2) { continue }
							let name = String(btn[0] ?? '')
							let fname = String(btn[1] ?? '')
							if (!name || !fname) { continue }

							let cls = 'code_block_textarea_btn'
							let btnStyle: unknown = null;
							if (btn[2]) {
								if (typeof (btn[2]) == 'string') {
									cls = btn[2]
								} else if (isRecord(btn[2])) {
									if (typeof btn[2].cls === 'string') {
										cls = btn[2].cls
									}
									btnStyle = btn[2]
								}
							}
							// 库自带函数
							let ufunc: unknown = (nc.textarea as unknown as Record<string, unknown>)[fname];
							if (typeof ufunc !== 'function') {
								ufunc = await nc.utils.get_str_func(nc.app, fname);
							}
							if (typeof ufunc === 'function') {
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
							let c = obsidianApp(nc.app).commands?.findCommand?.(fname);
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
									void obsidianApp(nc.app).commands.executeCommandById(fname);
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
										let tplExtra: Record<string, unknown> = {
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

