import { 
	App,TAbstractFile,TFile,TFolder,Vault,CachedMetadata
} from 'obsidian';

import NoteChainPlugin from "../main";
import {NoteChain} from "./NoteChain";
import { around } from 'monkey-around';


export class NCFileExplorer{
	plugin:NoteChainPlugin;
	app:App;
	chain:NoteChain;
	getSortedFolderItems:Function;
	getSortedFolderItems_new:Function;
	getTitle:Function;
	getTitle_new:Function;
	_FolderDom_:any;
	private explorerPatches: Function[] = [];

	constructor(plugin:NoteChainPlugin){
		this.plugin = plugin;
		this.chain = plugin.chain;
		this.app = plugin.app;
		this.register();
	}

	async register(){
		await this.waitForFileExplorer();
		await this.patchFileExplorer();
		try {			
			this.sort(0,true);
			this.set_display_text()
			this.set_fileitem_style()
			
		} catch (error) {
			
		}
	}

	

	async patchFileExplorer() {

		// 目录拖动排序
		let explorerView = this.file_explorer;
		this.explorerPatches.push(
			around(Object.getPrototypeOf((this.plugin.app as any).dragManager), {
				onDragEnd:(original) => function(...args:any[]) {
					let dragManager = this;
					let nc = dragManager.app.plugins.plugins['note-chain'];
					async function move_file(dragManager:any){
						try {
							let hoverEl = dragManager.hoverEl;
							// console.log('hoverEl:',hoverEl);
							if (hoverEl && (
									(hoverEl.classList.contains("tree-item") && hoverEl.classList.contains("nav-folder")) ||
									(hoverEl.classList.contains("nav-files-container"))
								)
							) {									
								let ghostEl = dragManager.ghostEl;
								if(!ghostEl){return;}

								let x = parseInt(ghostEl.style.left, 10);
								let y = parseInt(ghostEl.style.top, 10);
								let element = document.elementFromPoint(x,y);
								if(!element){return;}
								let path;
								if(element.classList.contains('nav-file-title-content')){
									element = element.closest('.nav-file-title');
									if(!element){return;}
								}
								
								path = element.getAttribute("data-path");

								let target = dragManager.app.vault.getAbstractFileByPath(path);
								if(target instanceof TFolder||target.extension!='md'){
									return;
								}
								let sourceEls = dragManager.sourceEls;

								if(!sourceEls || sourceEls.length==0){return;}
								let tfiles;
								if(sourceEls.length==1){
									tfiles = sourceEls.map((x:any)=>dragManager.app.vault.getAbstractFileByPath(x?.dataset?.path));
								}else{
									tfiles = nc.chain.get_selected_files(false);
								}
								// 需要先执行original.call(this,...args);
								setTimeout(() => {
									nc.chain.chain_set_next_files(tfiles as Array<TFile>,target,true);;
								}, 100);
								
							}
							
						} catch (error) {
							// console.log(error)
						}
					}
					if(nc.settings.isdraged){
						move_file(dragManager);
					}
					
					original.call(this,...args);
				},

			})
		);
		
		this.explorerPatches.push(
			around(Object.getPrototypeOf(explorerView), {
				getSortedFolderItems:(original) => function(e:any) {
					let plugin = (this.app as any).plugins.getPlugin('note-chain');
					if (plugin) {
						try {
							let res = original.call(this, e);
							let tfiles = plugin.chain.children[e.path];
							if (tfiles) {
								res = res.sort((a:any, b:any) => tfiles.indexOf(a.file) - tfiles.indexOf(b.file));
							}
							return res;
						} catch (e) {
							return original.call(this, e);
						}
					} else {
						return original.call(this, e);
					}
				},

				// dragFiles:(original) => function(...args) {
				// 	let nc = this.app.plugins.plugins['note-chain'];
				// 	if(nc.settings.isdraged){

				// 	}else{
				// 		return original.call(this, ...args);
				// 	}
				// }
			})
		);


		// 文件名称
		let item = Object.values((this.file_explorer as any).fileItems)[0];
		
		if(item){
			around(Object.getPrototypeOf(item), {
				getTtitle:(original) => function(e:any) {
					let plugin = (this.app as any).plugins.getPlugin('note-chain');
					return function(e:any){
						if(plugin){
							try{
								let res = plugin.explorer.get_display_text(this.file)
								return res;
							}catch(e){
								return original.call(this);
							}
						}else{
							return original.call(this);
						}
					}
				}
			})
		}
	}


	async unregister(){
		let items = (this.file_explorer as any).fileItems
		for(let key in items){
			let item = items[key]
			await this._set_display_text_(item,this.get_origin_text(item.file))
			item.el.style.background = null
			item.el.style.border = null
		}
		this.explorerPatches.forEach(unpatch => unpatch());
	}

	async waitForFileExplorer() {
		while (!(this.file_explorer as any).fileItems) {
			await new Promise(resolve => setTimeout(resolve, 100)); // 等待100ms再检查
		}
		return (this.file_explorer as any).fileItems
	}

	get file_explorer(){
		let a = this.app.workspace.getLeavesOfType(
			"file-explorer"
		)
		let view = a[0]?.view;
		return view;
	}
	
	async sort(nsleep=0,init=false){
		if((this.file_explorer as any)?.sort){
			if(nsleep>0){
				await sleep(nsleep);
			}
			if(init){
				this.plugin.chain.init_children();
			}

			if(Object.keys(this.plugin.chain.children).length==0){
				setTimeout(()=>{
					this.sort(nsleep,true);
				}, 3000);
			}else{
				(this.file_explorer as any).sort();
			}
		}	
	}

	get_field_of_display_text(tfile:TAbstractFile):string{
		if(this.plugin.settings.field_of_display_text){
			let item =  this.plugin.editor.get_frontmatter_config(tfile,this.plugin.settings.field_of_display_text)
			if(typeof(item) != 'string'){
				return ''
			}
			return item
		}
		return ''
	}

	get_origin_text(tfile:TAbstractFile){
		if(tfile instanceof TFile){
			if(tfile.extension=='md'){
				return tfile.basename
			}else if(tfile.extension=='canvas'){
				return tfile.basename
			}else{
				return tfile.name
			}
		}else{
			return tfile.name
		}
	}

	get_item(tfile:TAbstractFile,field:string){
		if(!field){return ''}
		let fields = field.split('|')
		let item:any = ''
		for(let f of fields){
			if(f=='$0'){
				return this.get_origin_text(tfile)
			}
			if(f.startsWith('?')){
				break
			}
			if(tfile instanceof TFile){
				let s = this.plugin.editor.get_frontmatter(tfile,f)
				if(typeof s === 'number'){
					item = `${s}`
				}else if(typeof(s)!='string' || s==''){
					continue
				}
				item = s
				break
			}
		}
		if(fields.last()?.startsWith('?') && item){
			return fields.last()?.slice(1).replace(/\$1/g,item)  || ''
		}
		return item
	}

	get_display_text(tfile:TAbstractFile) {
		let str = this.get_field_of_display_text(tfile)

		
		if(!str && this.plugin.settings.field_of_confluence_tab_format){
			str = `<${this.plugin.settings.field_of_confluence_tab_format}><$0>`
		}else{
			str = `<${this.plugin.settings.field_of_confluence_tab_format}>${str}`
		}
		
		if(!str || str=='$0' || str=='<$0>'){
			return this.get_origin_text(tfile)
		}
	  
		let mstr = str.replace(/\<(.+?)?\>/g, (match:string, field:string) => {
			return this.get_item(tfile,field)
		})
		mstr = mstr
		if(mstr==''){
			return this.get_origin_text(tfile)
		}else{
			return mstr
		}
	}

	_set_display_text_(item:any,txt:any){
		if(item && txt){
			if(typeof(txt)=='string'){
				item.innerEl.setText(txt)
			}
		}
	}
	set_display_text(){
		let items = (this.file_explorer as any).fileItems
		for(let key in items){
			let item = items[key]
			let txt = this.get_display_text(item.file)
			this._set_display_text_(item,txt)
		}
	}

	async get_fileitem_style(tfile:TAbstractFile){
		if(this.plugin.settings.field_of_background_color){
			let style = this.plugin.editor.get_frontmatter_config(tfile,this.plugin.settings.field_of_background_color)
			if(typeof(style)=='string'){
				let func = await this.plugin.utils.get_str_func(this.app,style)
				if(func){
					return func
				}
			}
			return style
		}
		return null
	}

	async set_fileitem_style(){
		let items = (this.file_explorer as any).fileItems
		for(let key in items){
			let item = items[key]
			let style = await this.get_fileitem_style(item.file)
			await this.set_fileitem_style_of_file(item.file,style)
		}
	}

	async set_fileitem_style_of_file(tfile:TAbstractFile,style=null){
		if(!tfile){return}
		if(!style){
			style = await this.get_fileitem_style(tfile)
		}
		let items = (this.file_explorer as any).fileItems
		let item = items[tfile.path]
		if(item){
			if(typeof(style)=='function'){
				style = await (style as any)(tfile)
				if(!style){
					return
				}
			}
			if(style==null){
				item.el.style.background = null
				item.el.style.border = null
			}else if (typeof(style)=='string'){
				item.el.style.background = style
			}else if(typeof(style)=='object'){
				for(let k in (style as any)){
					(item as any).el.style[k] = (style as any)[k]
				}
			}else if(typeof(style)=='function'){
				await (style as any)(tfile)
			}
		}
	}
}