import { 
	App, Editor, MarkdownView, Modal, Notice, 
	Plugin, PluginSettingTab, Setting,moment,MarkdownRenderer,Component,
	TAbstractFile,
	TFile,TFolder,
	MarkdownPostProcessorContext
} from 'obsidian';

import NoteChainPlugin from "../main";
import { config } from 'process';

export class NCTextarea{
	yamljs = require('js-yaml')
	plugin:NoteChainPlugin;
	app:App;

	constructor(plugin:NoteChainPlugin) {
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
	async registerMarkdownCodeBlockProcessor(field='textarea'){
		let nc = this.plugin
		nc.registerMarkdownCodeBlockProcessor(field, async (
			source: string, 
			el: HTMLElement, 
			ctx: MarkdownPostProcessorContext
		) => {
			source = source.trim()
			let config;
			if(source==''){
				config = {}
			}else{
				config = nc.textarea.yamljs.load(source);
			}
		

			let container = el.createEl("div", { cls: 'textarea-container' });

			let area:any=null;
			if(config['textarea']!=false){
				let cls = 'code_block_textarea'
				if(config.textarea?.cls){
					cls = config['textarea']['cls']
				}
				area = container.createEl("textarea",{cls:cls});
				area.style.width = '100%'
				area.style.height = '200px'
				let style = config.textarea?.style
				if(style && typeof(style)=='object'){
					for(let name in style){
						if(name=='backgroundImage'){
							let img = nc.chain.get_tfile(style[name])
							if(img){
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
			
			let btns = config['buttons'];
			if(btns && Array.isArray(btns)){
				// 创建一个按钮容器
				let buttonContainer = container.createEl("div", { cls: 'code_block_textarea_btn_container' });
				buttonContainer.style.display = 'flex'; // 设置按钮容器为flex布局，使按钮在同一行显示
				buttonContainer.style.justifyContent = 'flex-start'; // 设置按钮之间的间距均匀分布
				buttonContainer.style.marginTop = '10px'
				for(let btn of btns){
					let name = btn[0]
					let fname = btn[1]
					if(!name || !fname){continue}

					let cls = 'code_block_textarea_btn'
					if(btn[2]){
						cls = btn[2]
					}
					let ufunc = (nc.textarea as any)[fname];
					if(!ufunc){
						ufunc = await nc.utils.get_str_func(nc.app,fname);
					}
					if(ufunc){
						let xbtn = buttonContainer.createEl('button', { text: name,cls:cls});
						xbtn.addEventListener('click', () => {
							ufunc(area,source,el,ctx)
						});
						continue
					}
					let tfile = nc.chain.get_tfile(fname)
					if(tfile){
						let xbtn = buttonContainer.createEl('button', { text: name,cls:cls});
						xbtn.addEventListener('click', () => {
							nc.utils.parse_templater(
								nc.app,fname,true,{
									area:area,
									source:source,
									el:el,
									ctx:ctx
								}
							)
						});
						continue
					}
				}
				container.appendChild(buttonContainer);
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