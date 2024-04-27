import { 
	App,TAbstractFile,TFile,TFolder,Vault
} from 'obsidian';

import NoteChainPlugin from "../main";
import {NoteChain} from "./NoteChain";


let chain_sort = function(org_sort:Function) {
	let plugin = (app as any).plugins.getPlugin('note-chain');
	return function(...d:any){
		if(plugin){
			if(plugin?.settings.isSortFileExplorer){
				var e = this.file
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
				for (var r = [], o = 0, a = i; o < a.length; o++) {
					var s = a[o]
					, l = t.fileItems[s.path];
					l && r.push(l)
				}
				this.vChildren.setChildren(r)
			}else{
				return org_sort.call(this,...d);
			}
		}else{
			return org_sort.call(this,...d);
		}
	}
}

export class NCFileExplorer{
	plugin:NoteChainPlugin;
	app:App;
	chain:NoteChain;
	org_sort:Function;
	new_sort:Function;
	_FolderDom_:any;

	constructor(plugin:NoteChainPlugin){
		this.plugin = plugin;
		this.chain = plugin.chain;
		this.app = plugin.app;
		this.register();
	}


	register(){
		this.app.workspace.onLayoutReady(()=>{
			let folder;
			try {
				folder = new TFolder();
			} catch (error) {
				folder = new TFolder(Vault,"");
			}
			let dom = (this.file_explorer as any).createFolderDom(folder).constructor;
			this._FolderDom_ = dom;
			this.org_sort = dom.prototype.sort;
			this.new_sort = chain_sort(this.org_sort);
			this._FolderDom_.prototype.sort = this.new_sort;
			this.sort();
		})
	}

	unregister(){
		if(this.org_sort){
			console.log("Reset FileExplorer to origin sort function.");
			this._FolderDom_.prototype.sort = this.org_sort;
		}
	}

	get file_explorer(){
		let view = this.app.workspace.getLeavesOfType(
			"file-explorer"
		)[0]?.view;
		return view;
	}
	
	async sort(nsleep=0){
		if((this.file_explorer as any)?.sort){
			if(nsleep>0){
				await this.plugin.utils.sleep(nsleep);
			}
			this.plugin.chain.init_children();
			(this.file_explorer as any).sort();
		}	
	}
}


	