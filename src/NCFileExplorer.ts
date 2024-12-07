import { 
	App,TAbstractFile,TFile,TFolder,Vault,CachedMetadata
} from 'obsidian';

import NoteChainPlugin from "../main";
import {NoteChain} from "./NoteChain";


let chain_sort = function(org_sort:Function) {
	let plugin = (this.app as any).plugins.getPlugin('note-chain');
	return function(...d:any){
		if(plugin){
			if(plugin?.settings.isSortFileExplorer){
				let e = this.file
				, t = this.view
				, i = e.children.slice();
				i = i.filter((x:TAbstractFile)=>x);
				if(i.length>0){
					let items = plugin.chain.children[i[0].parent.path];
					if(items){
						let a = items.filter((x:TAbstractFile)=>i.contains(x));
						let b = items.filter((x:TAbstractFile)=>!i.contains(x));
						a.push(...b);
						i = a;
					}
				}
				if(plugin.settings.isFolderFirst){
					i = plugin.chain.sort_tfiles_folder_first(i);
				}
				let r = [];
				for (let o = 0, a = i; o < a.length; o++) {
					let s = a[o]
					, l = t.fileItems[s.path];
					l && r.push(l)
				}
				this.vChildren.setChildren(r);
			}else{
				return org_sort.call(this,...d);
			}
		}else{
			return org_sort.call(this,...d);
		}
	}
}

let getSortedFolderItems = function(org_sort:Function) {
	let plugin = (this.app as any).plugins.getPlugin('note-chain');
	return function(e:any){
		if(plugin){
			try{
				let res = org_sort.call(this,e);
				let tfiles = plugin.chain.children[e.path];
				if(tfiles){
					res = res.sort((a:any,b:any)=>tfiles.indexOf(a.file)-tfiles.indexOf(b.file));
				}
				return res;
			}catch(e){
				return org_sort.call(this,e);
			}
		}else{
			return org_sort.call(this,e);
		}
	}
}

let getTtitle = function(org_getTtile:Function) {
	let plugin = (this.app as any).plugins.getPlugin('note-chain');
	return function(e:any){
		if(plugin){
			try{
				let res = plugin.explorer.get_display_text(this.file)
				return res;
			}catch(e){
				return org_getTtile.call(this);
			}
		}else{
			return org_getTtile.call(this);
		}
	}
}

export class NCFileExplorer{
	plugin:NoteChainPlugin;
	app:App;
	chain:NoteChain;
	getSortedFolderItems:Function;
	getSortedFolderItems_new:Function;
	getTitle:Function;
	getTitle_new:Function;
	_FolderDom_:any;

	constructor(plugin:NoteChainPlugin){
		this.plugin = plugin;
		this.chain = plugin.chain;
		this.app = plugin.app;
		this.register();
	}

	register(){
		this.getSortedFolderItems = this.file_explorer.constructor.prototype.getSortedFolderItems;
		this.getSortedFolderItems_new = getSortedFolderItems(this.getSortedFolderItems);
		this.file_explorer.constructor.prototype.getSortedFolderItems = this.getSortedFolderItems_new;


		let item = (this.file_explorer as any).fileItems[
			this.plugin.chain.get_all_tfiles()[0].path
		]

		if(item){
			this.getTitle = item.constructor.prototype.getTitle
			this.getTitle_new = getTtitle(this.getTitle)
			item.constructor.prototype.getTitle = this.getTitle_new
		}
		
		this.sort(0,true);
		this.set_display_text()
		this.set_background_color()
	}

	unregister(){
		if(this.getSortedFolderItems){
			this.file_explorer.constructor.prototype.getSortedFolderItems = this.getSortedFolderItems;
		}
	}

	get file_explorer(){
		let view = this.app.workspace.getLeavesOfType(
			"file-explorer"
		)[0]?.view;
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

	get_field_of_display_text(tfile:TFile):string{
		if(this.plugin.settings.field_of_display_text){
			let item =  this.plugin.editor.get_frontmatter_config(tfile,this.plugin.settings.field_of_display_text)
			if(typeof(item) != 'string'){
				return ''
			}
			return item
		}
		return ''
	}

	get_item(tfile:TFile,field:string){
		let fields = field.split('|')
		for(let f of fields){
			if(f=='$0'){
				return tfile.basename
			}
			let s = this.plugin.editor.get_frontmatter(tfile,f)
			if(typeof(s)!='string' || s==''){
				continue
			}
			return s
		}
		return ''
	}

	get_display_text(tfile:TFile) {
		function get_origin_text(tfile:TFile){
			if(tfile.extension=='md'){
				return tfile.basename
			}else if(tfile.extension=='canvas'){
				return tfile.basename
			}else{
				return tfile.name
			}
		}

		let str = this.get_field_of_display_text(tfile)
		if(!str || str=='$0' || str=='{$0}'){
			return get_origin_text(tfile)
		}
	  
		let mstr = str.replace(/\{(.+?)?\}/g, (match:string, field:string) => {
			return this.get_item(tfile,field)
		})
		mstr = mstr.trim()
		if(mstr==''){
			return tfile.basename
		}else{
			return mstr
		}
	}

	set_display_text(){
		let items = (this.file_explorer as any).fileItems
		for(let key in items){
			let item = items[key]
			if(item.file.extension=='md'){
				let txt = this.get_display_text(item.file)
				item.innerEl.setText(txt)
			}
		}
	}

	get_background_color(tfile:TAbstractFile):string|null|undefined{
		if(this.plugin.settings.field_of_background_color){
			let color = this.plugin.editor.get_frontmatter_config(tfile,this.plugin.settings.field_of_background_color)
			if(!color){
				return null
			}else if(typeof(color)!='string'){
				return null
			}else{
				return color
			}
		}
		return null
	}

	set_background_color(){
		let items = (this.file_explorer as any).fileItems
		for(let key in items){
			let item = items[key]
			let color = this.get_background_color(item.file)
			item.el.style.background = color
		}
	}

	set_background_color_of_file(tfile:TAbstractFile){
		let color = this.get_background_color(tfile)
		let items = (this.file_explorer as any).fileItems
		if(items[tfile.path]){
			items[tfile.path].el.style.background = color
		}
	}
}