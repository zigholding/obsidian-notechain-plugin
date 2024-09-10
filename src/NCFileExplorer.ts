import { 
	App,TAbstractFile,TFile,TFolder,Vault
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

export class NCFileExplorer{
	plugin:NoteChainPlugin;
	app:App;
	chain:NoteChain;
	org_sort:Function;
	new_sort:Function;
	getSortedFolderItems:Function;
	getSortedFolderItems_new:Function;
	_FolderDom_:any;

	constructor(plugin:NoteChainPlugin){
		this.plugin = plugin;
		this.chain = plugin.chain;
		this.app = plugin.app;
		this.register();
	}


	register(){
		this.app.workspace.onLayoutReady(()=>{
			let folder = (this.app.vault as any).getAllFolders()[0];
			let dom = (this.file_explorer as any).createFolderDom(folder).constructor;
			this._FolderDom_ = dom;
			this.org_sort = dom.prototype.sort;
			this.new_sort = chain_sort(this.org_sort);
			this._FolderDom_.prototype.sort = this.new_sort;

			this.getSortedFolderItems = this.file_explorer.constructor.prototype.getSortedFolderItems;
			this.getSortedFolderItems_new = getSortedFolderItems(this.getSortedFolderItems);
			this.file_explorer.constructor.prototype.getSortedFolderItems = this.getSortedFolderItems_new;


			this.sort(0,true);
		})
	}

	unregister(){
		if(this.org_sort){
			this._FolderDom_.prototype.sort = this.org_sort;
		}
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
}


	