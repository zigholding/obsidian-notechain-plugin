import {
	App, Editor, MarkdownView, Modal, Notice,
	Plugin, PluginSettingTab, Setting, moment, MarkdownRenderer, Component,
	TAbstractFile,
	TFile, TFolder,
	MarkdownPostProcessorContext
} from 'obsidian';

import NoteChainPlugin from "../main";
import { config } from 'process';

export class NCTextarea {
	yamljs = require('js-yaml')
	plugin: NoteChainPlugin;
	app: App;

	constructor(plugin: NoteChainPlugin) {
		this.plugin = plugin;
		this.app = plugin.app;
		this.registerMarkdownCodeBlockProcessor()
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
			let config;
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

			let area: any = null;
			if (config['textarea'] != false) {
				let cls = 'code_block_textarea'
				if (config.textarea?.cls) {
					cls = config['textarea']['cls']
				}
				area = container.createEl("textarea", { cls: cls });
				area.style.width = '100%'
				area.style.height = '200px'
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
						buttonContainer.style.display = 'flex'; // 设置按钮容器为flex布局，使按钮在同一行显示
						buttonContainer.style.justifyContent = 'flex-start'; // 设置按钮之间的间距均匀分布
						buttonContainer.style.marginTop = '10px'

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
										(xbtn as any).style.backgroundSize = 'cover';
										(xbtn as any).style.backgroundRepeat = 'no-repeat';
										(xbtn as any).style.backgroundPosition = 'center';
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
								if (btnStyle) {
									await applyBtnStyle(xbtn, btnStyle);
								}
								xbtn.addEventListener('click', () => {
									ufunc(area, source, el, ctx)
								});
								continue
							}

							// 命令
							let c = (nc.app as any).commands?.findCommand(fname);
							if (c) {
								let xbtn = buttonContainer.createEl('button', { text: name, cls: cls });
								if (btnStyle) {
									await applyBtnStyle(xbtn, btnStyle);
								}
								xbtn.addEventListener('click', () => {
									(nc.app as any).commands.executeCommandById(fname)
								});
								continue
							}

							let tfile = nc.easyapi.file.get_tfile(fname)
							if (tfile) {
								let xbtn = buttonContainer.createEl('button', { text: name, cls: cls });
								if (btnStyle) {
									await applyBtnStyle(xbtn, btnStyle);
								}
								xbtn.addEventListener('click', () => {
									let tags = nc.easyapi.file.get_tags(tfile).map(x=>x.slice(1)).filter(
										x=>nc.settings.tpl_tags_folder.contains(x)
									);
									if(tags.length>0){
										nc.easyapi.tpl.parse_templater(
											fname, true, {
												area: area,
												source: source,
												el: el,
												ctx: ctx,
												params: btn[3]
											}
										);
									}else{
										nc.chain.open_note_in_modal(tfile.path)
									}
								});
								continue
							}
						}
						container.appendChild(buttonContainer);
					}
				}
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
		navigator.clipboard.writeText(area.value);
	}

	log_area(area: HTMLTextAreaElement) {
		console.log('当前Textarea为：')
		console.log(area)
	}
}


