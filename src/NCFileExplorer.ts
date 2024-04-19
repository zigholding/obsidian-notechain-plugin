import { 
	App,TAbstractFile,TFolder,Vault
} from 'obsidian';

import {NoteChainPlugin} from "../main";

chain_sort = function(org_sort) {
	let plugin = app.plugins.getPlugin('note-chain');
	return function(...d){
		if(plugin){
			if(plugin?.settings.isSortFileExplorer){
				var e = this.file
				, t = this.view
				, i = e.children.slice();
				i = i.filter((x:TAbstractFile)=>x);
				i = plugin.chain.dbchain.sort_tfiles_by_chain(i);
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

chain_sort_v1 = function(org_sort) {
	let plugin = app.plugins.getPlugin('note-chain');
	return function(...d){
		if(plugin){
			if(plugin?.settings.isSortFileExplorer){
				var e = this.file
				, t = this.view
				, i = e.children.slice();
				i = i.filter(x=>x);
				i = plugin.chain.sort_tfiles_by_chain(i);
				i = plugin.chain.sort_tfiles_folder_first(i);
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
	org_sort:Function;

	constructor(plugin:NoteChainPlugin){
		this.plugin = plugin;
		this.app = plugin.app;
		this.ob = require('obsidian');
		this.register();
	}

	register(){
		this.app.workspace.onLayoutReady(()=>{
			let folder = new TFolder(Vault,"");
			let dom = this.file_explorer.createFolderDom(folder).constructor;
			this._FolderDom_ = dom;
			this.org_sort = dom.prototype.sort;
			this.new_sort = chain_sort(this.org_sort);
			this._FolderDom_.prototype.sort = this.new_sort;
			this.file_explorer.sort();
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
		if(nsleep>0){
			await this.plugin.editor.sleep(nsleep);
		}
		this.plugin.chain.dbchain.init_chains();
		this.file_explorer.sort();
	}
}


	