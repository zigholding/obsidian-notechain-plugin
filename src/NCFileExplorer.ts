import { 
	App,TAbstractFile,TFile,TFolder
} from 'obsidian';

import NoteChainPlugin from "./plugin";
import {NoteChain} from "./NoteChain";
import { around } from 'monkey-around';
import {
	appDragManager,
	asFileExplorerView,
	noteChainPlugin,
	type AppDragManager,
	type FileExplorerTreeItem,
	type FileExplorerView,
} from './obsidian-app';
import { isRecord } from './ts-helpers';


export class NCFileExplorer{
	plugin:NoteChainPlugin;
	app:App;
	chain:NoteChain;
	_FolderDom_: unknown;
	private explorerPatches: Array<() => void> = [];
	private displayTextCache = new WeakMap<TAbstractFile, string>();

	constructor(plugin:NoteChainPlugin){
		this.plugin = plugin;
		this.chain = plugin.chain;
		this.app = plugin.app;
		void this.register();
	}

	async register(){
		await this.waitForFileExplorer();
		await this.patchFileExplorer();
		try {			
			await this.sort(0,true)
			this.set_display_text()
			await this.set_fileitem_style()
		} catch {
			// file explorer not ready
		}
	}

	async patchFileExplorer() {

		// 目录拖动排序
		let explorerView = this.file_explorer;
		const dragManagerProto = appDragManager(this.plugin.app);
		if (dragManagerProto) {
		this.explorerPatches.push(
			around(Object.getPrototypeOf(dragManagerProto), {
				onDragEnd:(original) => function(this: AppDragManager, ...args: unknown[]) {
					let nc = noteChainPlugin(this.app);
					async function move_file(dragManager: AppDragManager){
						try {
							let hoverEl = dragManager.hoverEl;
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
								if (!path) { return; }

								let target = dragManager.app.vault.getAbstractFileByPath(path);
								
								if(!(target instanceof TFile) || target.extension!='md'){
									return;
								}
								let sourceEls = dragManager.sourceEls;

								if(!sourceEls || sourceEls.length==0){return;}
								let tfiles: TFile[];
								if(sourceEls.length==1){
									tfiles = sourceEls.map((x)=>dragManager.app.vault.getAbstractFileByPath(x?.dataset?.path ?? '')).filter((f): f is TFile => f instanceof TFile);
								}else{
									tfiles = nc?.easyapi.file.get_selected_files(false) ?? [];
								}
								window.setTimeout(() => {
									void nc?.chain.chain_set_next_files(tfiles,target,true);
								}, 100);
								
							}
							
						} catch {
							// drag target lookup can fail mid-drop
						}
					}
					if(nc?.settings.notechain.isdraged){
						void move_file(this);
					}
					
					original.call(this,...args);
				},
			})
		);
		}
		
		this.explorerPatches.push(
			around(Object.getPrototypeOf(explorerView), {
				getSortedFolderItems:(original) => function(this: { app: App }, e: TFolder) {
					let plugin = noteChainPlugin(this.app);
					if (plugin) {
						try {
							let res = original.call(this, e) as FileExplorerTreeItem[];
							let tfiles = plugin.chain.children[e.path];
							if (tfiles) {
								res = res.sort((a, b) => {
									let ia = tfiles.indexOf(a.file);
									let ib = tfiles.indexOf(b.file);
									if (ia < 0) { ia = tfiles.length; }
									if (ib < 0) { ib = tfiles.length; }
									return ia - ib;
								});
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


		// File / folder titles (indent + display field). Collapsed folders
		// create child items only on expand, via getTitle / setCollapsed.
		const plugin = this.plugin;
		const items = Object.values(this.file_explorer?.fileItems ?? {});
		const patchedProtos = new Set<object>();
		const patchGetTitle = (start: object) => {
			let proto: object | null = start;
			while (proto && proto !== Object.prototype) {
				if (patchedProtos.has(proto)) { return; }
				if (Object.prototype.hasOwnProperty.call(proto, 'getTitle')
					&& typeof (proto as FileExplorerTreeItem).getTitle === 'function') {
					patchedProtos.add(proto);
					this.explorerPatches.push(
						around(proto, {
							getTitle: (original: () => string) => function(this: FileExplorerTreeItem) {
								try {
									return plugin.explorer.get_display_text(this.file);
								} catch {
									return original.call(this);
								}
							},
						})
					);
					return;
				}
				proto = Object.getPrototypeOf(proto) as object | null;
			}
		};
		const fileItem = items.find(i => i.file instanceof TFile);
		const folderItem = items.find(i => i.file instanceof TFolder);
		if (fileItem) {
			patchGetTitle(Object.getPrototypeOf(fileItem) as object);
		}
		if (folderItem) {
			patchGetTitle(Object.getPrototypeOf(folderItem) as object);
			let folderProto: object | null = Object.getPrototypeOf(folderItem) as object;
			while (folderProto && folderProto !== Object.prototype) {
				if (Object.prototype.hasOwnProperty.call(folderProto, 'setCollapsed')
					&& typeof (folderProto as FileExplorerTreeItem).setCollapsed === 'function') {
					this.explorerPatches.push(
						around(folderProto, {
							setCollapsed: (original: (...args: unknown[]) => unknown) => function(this: FileExplorerTreeItem, ...args: unknown[]) {
								const result = original.apply(this, args);
								const collapsed = args[0];
								const paint = () => {
									if (this.file instanceof TFolder && collapsed === false) {
										plugin.explorer.refresh_display_text(this.file);
									}
								};
								if (result && typeof (result as Promise<unknown>).then === 'function') {
									void (result as Promise<unknown>).then(paint);
								} else {
									window.setTimeout(paint, 0);
								}
								return result;
							},
						})
					);
					break;
				}
				folderProto = Object.getPrototypeOf(folderProto) as object | null;
			}
		}
	}


	unregister(){
		let items = this.file_explorer?.fileItems
		for(let key in items){
			let item = items[key]
			this._set_display_text_(item,this.get_origin_text(item.file))
			item.el.style.removeProperty('background')
			item.el.style.removeProperty('border')
		}
		this.explorerPatches.forEach(unpatch => unpatch());
	}

	async waitForFileExplorer() {
		while (!this.file_explorer?.fileItems) {
			await new Promise(resolve => window.setTimeout(resolve, 100)); // 等待100ms再检查
		}
		return this.file_explorer.fileItems
	}

	get file_explorer(): FileExplorerView | undefined {
		let a = this.app.workspace.getLeavesOfType(
			"file-explorer"
		)
		return asFileExplorerView(a[0]?.view);
	}
	
	async sort(nsleep=0,init=false){
		if(this.file_explorer?.sort){
			if(nsleep>0){
				await sleep(nsleep);
			}
			if(init){
				this.plugin.chain.init_children();
			}

			if(Object.keys(this.plugin.chain.children).length==0){
				window.setTimeout(()=>{
					void this.sort(nsleep,true);
				}, 3000);
			}else{
				this.file_explorer.sort();
			}
		}	
	}

	get_field_of_display_text(tfile:TAbstractFile):string{
		if(this.plugin.settings.notechain.field_of_display_text){
			let item =  this.plugin.editor.get_frontmatter_config(tfile,this.plugin.settings.notechain.field_of_display_text)
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
			}else if(tfile.extension=='base'){
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
		let item = ''
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
					break
				}else if(typeof s === 'string' && s!=''){
					item = s
					break
				}
			}
		}
		if(fields.last()?.startsWith('?') && item){
			return fields.last()?.slice(1).replace(/\$1/g,item)  || ''
		}
		return item
	}

	invalidate_display_text(tfile?: TAbstractFile) {
		if (!tfile) {
			this.displayTextCache = new WeakMap();
			return;
		}
		this.displayTextCache.delete(tfile);
	}

	get_display_text(tfile:TAbstractFile) {
		const cached = this.displayTextCache.get(tfile);
		if (cached !== undefined) {
			return cached;
		}
		let str = this.get_field_of_display_text(tfile)

		
		if(!str && this.plugin.settings.notechain.field_of_confluence_tab_format){
			str = `<${this.plugin.settings.notechain.field_of_confluence_tab_format}><$0>`
		}else{
			str = `<${this.plugin.settings.notechain.field_of_confluence_tab_format}>${str}`
		}
		
		if(!str || str=='$0' || str=='<$0>'){
			const origin = this.get_origin_text(tfile)
			this.displayTextCache.set(tfile, origin)
			return origin
		}
	  
		const mstr = str.replace(/<(.+?)?>/g, (_match:string, field:string) => {
			return this.get_item(tfile,field)
		})
		const text = mstr=='' ? this.get_origin_text(tfile) : mstr
		this.displayTextCache.set(tfile, text)
		return text
	}

	_set_display_text_(item: FileExplorerTreeItem | undefined, txt: unknown){
		if(item && txt){
			if(typeof(txt)=='string'){
				item.innerEl.setText(txt)
			}
		}
	}
	set_display_text(){
		this.invalidate_display_text()
		let items = this.file_explorer?.fileItems
		for(let key in items){
			let item = items[key]
			let txt = this.get_display_text(item.file)
			this._set_display_text_(item,txt)
		}
	}

	/** Re-apply indented/display titles after Files rewrites innerEl (e.g. rename). */
	refresh_display_text(tfile?: TAbstractFile){
		const items = this.file_explorer?.fileItems
		if(!items){ return }
		if(!tfile){
			this.set_display_text()
			return
		}

		const apply = (f: TAbstractFile) => {
			this.invalidate_display_text(f)
			this._set_display_text_(items[f.path], this.get_display_text(f))
		}
		apply(tfile)

		if(tfile instanceof TFile && tfile.extension === 'md'){
			const canvas = items[tfile.path.slice(0, tfile.path.length - 2) + 'canvas']
			if(canvas){
				this.invalidate_display_text(canvas.file)
				this._set_display_text_(canvas, this.get_display_text(canvas.file))
			}
		}

		const folder = tfile instanceof TFolder ? tfile : (
			tfile instanceof TFile && tfile.parent && tfile.basename === tfile.parent.name
				? tfile.parent
				: null
		)
		if(!folder){ return }
		const ppath = folder.path === '/' ? '' : folder.path + '/'
		for(const key in items){
			const item = items[key]
			if(item.file.path.startsWith(ppath) || item.file.path === folder.path){
				this.invalidate_display_text(item.file)
				this._set_display_text_(item, this.get_display_text(item.file))
			}
		}
	}

	async get_fileitem_style(tfile:TAbstractFile){
		if(this.plugin.settings.notechain.field_of_background_color){
			let style = this.plugin.editor.get_frontmatter_config(tfile,this.plugin.settings.notechain.field_of_background_color)
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
		let items = this.file_explorer?.fileItems
		for(let key in items){
			let item = items[key]
			let style = await this.get_fileitem_style(item.file)
			await this.set_fileitem_style_of_file(item.file,style)
		}
	}

	async set_fileitem_style_of_file(tfile:TAbstractFile, style: unknown = null){
		if(!tfile){return}
		if(!style){
			style = await this.get_fileitem_style(tfile)
		}
		let items = this.file_explorer?.fileItems
		let item = items?.[tfile.path]
		if(item){
			if(typeof(style)=='function'){
				style = await (style as (file: TAbstractFile) => Promise<unknown>)(tfile)
				if(!style){
					return
				}
			}
			if(style==null){
				item.el.style.removeProperty('background')
				item.el.style.removeProperty('border')
			}else if (typeof(style)=='string'){
				item.el.style.background = style
			}else if(isRecord(style)){
				for(const k of Object.keys(style)){
					item.el.style.setProperty(k, String(style[k] ?? ''))
				}
			}else if(typeof(style)=='function'){
				await (style as (file: TAbstractFile) => Promise<unknown>)(tfile)
			}
		}
	}
}