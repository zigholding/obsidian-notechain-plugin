
import { 
	App, Editor, MarkdownView, Modal, Notice, 
	Plugin, PluginSettingTab, Setting,
	TAbstractFile,
	TFile,TFolder
} from 'obsidian';

import NoteChainPlugin from "../main";
import {NCEditor} from './NCEditor';
import {get_tp_func} from './utils'
import { strings } from './strings';


export class NoteChain{
	plugin:NoteChainPlugin;
	app:App;
	prev:string;
	next:string;
	editor:NCEditor;
	children:{[key:string]:any};

	constructor(plugin:NoteChainPlugin,editor:NCEditor,prev="PrevNote",next="NextNote") {
		this.plugin = plugin;
		this.app = plugin.app;
		this.editor = new NCEditor(this.app);
		
		this.prev = prev;
		this.next = next;
		this.init_children();
	}
    
	init_children(){
		this.children = {};
		for(let f of this.get_all_folders()){
			let tfiles = f.children;
			if(this.plugin.explorer?.file_explorer){
				tfiles  = this.sort_tfiles(
					tfiles,
					(this.plugin.explorer.file_explorer as any).sortOrder
				);
			}
			(this.children as any)[f.path] = this.sort_tfiles_by_chain(tfiles);
		}
	}

	refresh_children(tfile:TAbstractFile){
		if(tfile.parent?.children){
			let tfiles  = tfile.parent.children;
			if(this.plugin.explorer.file_explorer){
				tfiles  = this.sort_tfiles(
					tfiles as any,
					(this.plugin.explorer.file_explorer as any).sortOrder
				);
			}
			this.children[tfile.parent.path] = this.sort_tfiles_by_chain(
				tfiles
			);
		}
	}

	get tp_find_tfile(){
		return get_tp_func(this.app,'tp.file.find_tfile');
	}

	get tp_suggester(){
		return get_tp_func(this.app,'tp.system.suggester');
	}

	get tp_prompt(){
		return get_tp_func(this.app,'tp.system.prompt');
	}

	get_all_folders(){
		let folders = (this.app.vault as any).getAllFolders();
		let folder = this.app.vault.getFolderByPath('/');
		if(folder&& !folders.contains(folder)){
			folders.push(folder);
		}
		return folders;
	}

	get_all_tfiles(sort_mode=''){
		let files = this.app.vault.getMarkdownFiles();
		if(!(sort_mode==='')){
			this.sort_tfiles(files,sort_mode=sort_mode);
		}
		return files;
	}
	
	sort_folders_by_mtime(folders:Array<TFolder>,reverse=true){
		function ufunc(f:TFolder){
			return Math.max(
				...f.children.filter((f:TFile)=>f.basename).map((f:TFile)=>f.stat
				.mtime)
			)
		}
		let res = folders.sort((a,b)=>ufunc(a)-ufunc(b));
		if(reverse){
			res = res.reverse();
		}
		return res;
	}

	async cmd_move_file_to_another_folder(tfile=this.current_note){
		if(tfile==null){return;}

		let folders = this.get_all_folders();
		folders = this.sort_folders_by_mtime(folders
		).filter(f=>f!=tfile.parent);

		if(tfile.extension==='md'){
			folders = folders.filter((f:TFile)=>this.filter_user_ignore(f));
		}
		try {
			let folder = await this.tp_suggester((f:TFile)=>f.path,folders);
			// 移动笔记
			let dst = folder.path+"/"+tfile.basename+"."+tfile.extension;
			await this.app.fileManager.renameFile(tfile,dst);
		} catch (error) {
			
		}
	}
	
	filter_user_ignore(note:TFile){
		if(!((this.app.vault as any).config.attachmentFolderPath==='./')){
			if(note.path.startsWith(
				(this.app.vault as any).config.attachmentFolderPath)
			){
				return false;
			}
		}
		if((this.app.vault as any).userIgnoreFilters){
			for(let x of (this.app.vault as any).userIgnoreFilters){
				if(note.path.startsWith(x)){
					return false;
				}
			}
		}
		return true;
	}

	async sugguster_note(){
		// 从库中选择一个笔记
		let notes = this.sort_tfiles(
			this.app.vault.getFiles(),
			['mtime','x']
		).filter((f:TFile)=>this.filter_user_ignore(f));
		try {
			let note = await this.tp_suggester((f:TFile)=>f.path,notes);
			return note;
		} catch (error) {
			return null;
		}
	}

	open_note(tfile:TFile,new_tab=false,revealFolder=false){
		if(tfile){
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if(!view || view.leaf && !((view.leaf as any).pinned)||new_tab){
				this.app.workspace.getLeaf(true).openFile(tfile);
			}else{
				view.leaf.openFile(tfile);
			}
			
			if(revealFolder){
				(this.plugin.explorer.file_explorer as any).revealInFolder(tfile);
			}
		}
	}

	async sugguster_open_note(){
		try {
			let note = await this.sugguster_note();
			this.open_note(note);
		} catch (error) {
		}
	}


	get_tfile(path:string){
		let name = path.split('|')[0].replace('[[','').replace(']]','');
		return this.tp_find_tfile(name);
	}

	get current_note(){
		return this.app.workspace.getActiveFile();
	}

	get_inlinks(tfile=this.current_note){
		if(tfile==null){return [];}

		let res = new Array();

		let dv_api = (this.app as any).plugins.getPlugin("dataview");

		let inlinks = dv_api.index.links.invMap.get(tfile.path);
		if(inlinks==undefined){
			return [];
		}else{
			return Array.from(inlinks).map(
				(path:string)=>((this.app.vault as any).fileMap[path])
			).filter(
				(item:string)=>(item)
			)
		}
	}

	get_outlinks(tfile=this.current_note){
		if(tfile==null){return [];}
		let dv_api = (this.app as any).plugins.getPlugin("dataview");
		let inlinks = dv_api.index.links.map.get(tfile.path);
		if(inlinks==undefined){
			return [];
		}else{
			return Array.from(inlinks).map(
				(path:string)=>((this.app.vault as any).fileMap[path])
			).filter(
				(item:string)=>(item)
			)
		}
	}

	get_links(tfile=this.current_note){
		let inlinks = this.get_inlinks(tfile);
		let outlinks = this.get_outlinks(tfile);
		for(let link of inlinks){
			if(!outlinks.includes(link)){
				outlinks.push(link)
			}
		}
		return outlinks;
	}

	get_brothers(tfile=this.current_note){
		if(tfile&&tfile.parent){
			return this.get_tfiles_of_folder(tfile.parent,false);
		}else{
			return [];
		}
		
	}

	get_uncles(tfile:TFile){
		if(tfile && tfile.parent && tfile.parent.parent){
			let folder = tfile.parent.parent;
			return folder.children.filter(
				(x:TAbstractFile)=>x instanceof TFile
			)
		}
		return []
	}

	get_tfiles_of_folder(tfolder:TFolder|null,with_children=false):any{
		if(tfolder==null){return [];}
		let notes = [];
		for(let c of tfolder.children){
			if(c instanceof TFile && c.extension==='md'){
				notes.push(c);
			}else if(c instanceof TFolder && with_children){
				let tmp = this.get_tfiles_of_folder(c);
				for(let x of tmp){
					notes.push(x);
				}
			}
		}
		return notes;

	}

	indexOfFolder(tfile:TFolder,tfiles:Array<TFile>){
		let fnote = this.tp_find_tfile(tfile.name+'.md');
		if(!fnote){return -1;}
		let msg = this.plugin.editor.get_frontmatter(
			fnote,"FolderPrevNote"
		);
		if(!msg){return -1;}
		let anchor = this.get_tfile(msg);
		if(!anchor){return -1;}
		let idx = tfiles.indexOf(anchor);
		let offset = this.plugin.editor.get_frontmatter(
			fnote,"FolderPrevNoteOffset"
		);
		if(offset){
			idx = idx + parseFloat(offset);
		}else{
			idx = idx + 0.5;
		}
		return idx;
	}

	tfile_to_string(tfile:TFile){
		let curr = this.current_note;
		let msg = '';
		if(tfile.parent==curr?.parent){
			msg = tfile.basename;
		}else{
			msg = tfile.path;
		}
		if(tfile==this.current_note){
			return `🏠 ${msg}`
		}else{
			return msg;
		}
		
	}

	async suggester_notes(tfile=this.current_note,curr_first=false,smode=''){
		if(tfile){tfile==this.current_note;}
		let kv = [
			this.plugin.strings.item_get_brothers,
			this.plugin.strings.item_notechain,
			this.plugin.strings.item_uncle_notes,
			this.plugin.strings.item_same_folder,
			this.plugin.strings.item_inlinks_outlinks,
			this.plugin.strings.item_inlins,
			this.plugin.strings.item_outlinks,
			this.plugin.strings.item_all_noes,
			this.plugin.strings.item_recent,
		]
		
		if(curr_first){
			kv.unshift(this.plugin.strings.item_currentnote)
		}else{
			kv.push(this.plugin.strings.item_currentnote)
		}
		
		let kvs = []
		let i = 1;
		for(let x of kv){
			kvs.push(`${i++} ${x}`);
		}

		let mode = '';
		if(kv.contains(smode)){
			mode = smode;
		}else{
			mode = await this.tp_suggester(kvs,kv);
		}
		if(mode===this.plugin.strings.item_currentnote){
			return [tfile];
		}else if(mode===this.plugin.strings.item_get_brothers){
			return this.get_brothers(tfile);
		}else if(mode===this.plugin.strings.item_same_folder){
			if(tfile?.parent){
				return this.get_tfiles_of_folder(tfile.parent,true);
			}
		}else if(mode===this.plugin.strings.item_inlinks_outlinks){
			return this.get_links(tfile);
		}else if(mode===this.plugin.strings.item_inlins){
			return this.get_inlinks(tfile);
		}else if(mode===this.plugin.strings.item_outlinks){
			return this.get_outlinks(tfile);
		}else if(mode===this.plugin.strings.item_all_noes){
			return this.get_all_tfiles();
		}else if(mode===this.plugin.strings.item_recent){
			let r = (this.app as any).plugins.getPlugin("recent-files-obsidian");
			if(!r){return [];}
			return Object.values(
				r.data.recentFiles).map((f:TAbstractFile)=>(this.app.vault as any).fileMap[f.path]
			).filter(f=>f);
		}else if(mode===this.plugin.strings.item_uncle_notes){
			if(tfile){
				return this.get_uncles(tfile);
			}
		}else if(mode===this.plugin.strings.item_notechain){
			return this.get_chain(
				tfile,
				Number(this.plugin.settings.PrevChain),
				Number(this.plugin.settings.NextChain)
			);
		}else{
			return [];
		}
	}


	// Chain
	get_prev_note(tfile=this.current_note){
		if(!tfile){return;}
		if((tfile as any).deleted){
			let tfiles = this.app.vault.getMarkdownFiles();
			
			tfiles.filter(f=>`[[${tfile.basename}]]`===this.plugin.editor.get_frontmatter(f,"NextNote"))
			tfiles = tfiles.filter(f=>`[[${tfile.basename}]]`===this.editor.get_frontmatter(f,this.next));
			if(tfiles.length>0){
				return tfiles[0];
			}else{
				return null;
			}
		}else{
			let name = this.editor.get_frontmatter(tfile,this.prev);
			if(!name){return null;}

			let note = this.get_tfile(name);
			return note?note:null;
		}
		
	}

	open_prev_notes(tfile=this.current_note){
		let note = this.get_prev_note(tfile);
		this.open_note(note);
	}

	get_next_note(tfile=this.current_note){
		if(!tfile){return null;}
		if((tfile as any).deleted){
			let tfiles = this.app.vault.getMarkdownFiles();
			tfiles = tfiles.filter(f=>`[[${tfile.basename}]]`===this.editor.get_frontmatter(f,this.prev));
			if(tfiles.length>0){
				return tfiles[0];
			}else{
				return null;
			}
		}else{
			let name = this.editor.get_frontmatter(tfile,this.next);
			if(!name){return null;}

			let note = this.get_tfile(name);
			return note?note:null;
		}
	}

	open_next_notes(tfile=this.current_note){
		let note = this.get_next_note(tfile);
		this.open_note(note);
	}

	get_chain(tfile=this.current_note,prev=10,next=10,with_self=true){
		if(tfile==null){return [];}
		
		let res = new Array();
		if(with_self){
			res.push(tfile);
		}
		
		let tmp = tfile;
		for(let i=prev;i!=0;i--){	
			let note = this.get_prev_note(tmp);
			if(!note){
				break;
			}else if(res.includes(note)){
				// // 每次自动删除循环链接
				// this.editor.set_frontmatter(note,this.next,"");
				// this.editor.set_frontmatter(tmp,this.prev,"");
				break;
			}else{
				res.unshift(note);
				tmp = note;
			}
		}
	
		tmp = tfile;
		for(let i=next;i!=0;i--){
			let note = this.get_next_note(tmp);
			if(!note){
				break;
			}else if(res.includes(note)){
				// // 每次自动删除循环链接
				// this.editor.set_frontmatter(note,this.prev,"");
				// this.editor.set_frontmatter(tmp,this.next,"");
				break;
			}else{
				res.push(note);
				tmp = note;
			}
		}
		return res;
	}

	get_first_note(tfile=this.current_note){
		let notes = this.get_chain(tfile,-1,0,false);
		if(notes.length>0){
			return notes[0];
		}else{
			return null;
		}
	}

	get_last_note(tfile=this.current_note){
		let notes = this.get_chain(tfile,0,-1,false);
		if(notes.length>0){
			return notes[notes.length-1];
		}else{
			return null;
		}
	}

	get_neighbors(tfile=this.current_note){
		return [
			this.get_prev_note(tfile),
			this.get_next_note(tfile),
		]
	}
	
	async chain_set_prev(tfile:TFile,prev:TFile|null){
		if(tfile==null || tfile==prev){return;}
		if(this.get_prev_note(tfile)==prev){return;}
		let msg = `Note Chain: ${prev?.basename} --> 🏠${tfile.basename}`;
		if(prev==null ){
			await this.editor.set_frontmatter(
				tfile,this.prev,null
			);
		}else{
			await this.editor.set_frontmatter(
				tfile,this.prev,`[[${prev.basename}]]`
			);
		}
		new Notice(msg,5000);
	}

	async chain_set_next(tfile:TFile,next:TFile|null){
		if(tfile==null || tfile==next){return;}
		if(this.get_next_note(tfile)==next){return;}
		let msg = `Note Chain: 🏠${tfile?.basename} <-- ${next?.basename}`;
		if(next==null ){
			await this.editor.set_frontmatter(
				tfile,this.next,null
			);
		}else{
			await this.editor.set_frontmatter(
				tfile,this.next,`[[${next.basename}]]`
			);
		}
		new Notice(msg,5000);
	}

	async chain_set_prev_next(tfile:TFile,prev:TFile,next:TFile){
		if(tfile==null || prev==next||tfile==prev||tfile==next){return;}

		if(this.get_prev_note(tfile)==prev){
			await this.chain_set_next(tfile,next);
			return;
		}

		if(this.get_next_note(tfile)==next){
			await this.chain_set_prev(tfile,prev);
			return;
		}

		let msg = `Note Chain: ${prev?.basename} --> 🏠${tfile?.basename} <-- ${next?.basename}`;
		let fm:{[key:string]:any} = {};
		fm[this.prev] = prev?`[[${prev.basename}]]`:null;
		fm[this.next] = next?`[[${next.basename}]]`:null;
		await this.plugin.editor.set_multi_frontmatter(tfile,fm);
		new Notice(msg,5000);
	}

	async chain_link_prev_next(prev:TFile,next:TFile){
		await this.chain_set_prev(next,prev);
		await this.chain_set_next(prev,next);
	}

	async chain_concat_tfiles(tfiles:Array<TFile>){
		// 清除自闭环
		let prev = this.get_prev_note(tfiles[0]);
		if(tfiles.contains(prev)){
			await this.chain_set_prev(tfiles[0],null);
		}

		// 清除自闭环
		let next = this.get_next_note(tfiles[tfiles.length-1]);
		if(tfiles.contains(next)){
			await this.chain_set_next(tfiles[tfiles.length-1],null);
		}
		if(tfiles.length<=1){
			return;
		}
		let N = tfiles.length;
		await this.chain_set_next(tfiles[0],tfiles[1]);
		await this.chain_set_prev(tfiles[N-1],tfiles[N-2]);
		for(let i=1;i<tfiles.length-1;i++){
			await this.chain_set_prev_next(tfiles[i],tfiles[i-1],tfiles[i+1])
		}
	}

	async chain_pop_node(tfile:TFile){
		let notes = this.get_neighbors(tfile);
		await this.chain_link_prev_next(notes[0],notes[1]);
	}

	async chain_insert_node_as_head(tfile:TFile,anchor:TFile){
		let head = this.get_first_note(anchor);
		await this.chain_link_prev_next(tfile,head);
	}

	async chain_insert_node_as_tail(tfile:TFile,anchor:TFile){
		let tail = this.get_last_note(anchor);
		await this.chain_link_prev_next(tail,tfile);
	}

	async chain_insert_node_after(tfile:TFile,anchor:TFile){
		let anchor_next = this.get_next_note(anchor);
		if(anchor_next==tfile){return;}

		let tfile_neighbor = this.get_neighbors(tfile);
		if(tfile_neighbor[1]==anchor){
			await this.chain_concat_tfiles(
				[tfile_neighbor[0],anchor,tfile,anchor_next]
			);
		}else{
			await this.chain_pop_node(tfile);
			await this.chain_concat_tfiles([anchor,tfile,anchor_next]);
		}
	}

	async chain_insert_node_before(tfile:TFile,anchor:TFile){
		let anchor_prev = this.get_prev_note(anchor);
		if(anchor_prev==tfile){return;}
		let tfile_neighbor = this.get_neighbors(tfile);
		if(tfile_neighbor[0]==anchor){
			await this.chain_concat_tfiles(
				[anchor_prev,tfile,anchor,tfile_neighbor[1]]
			);
		}else{
			await this.chain_pop_node(tfile);
			await this.chain_concat_tfiles([anchor_prev,tfile,anchor]);
		}
	}

	async chain_insert_folder_after(tfile:TFile,anchor:TFile){
		if(!tfile.parent || tfile.parent.parent!=anchor.parent){
			return;
		}
		let note = this.get_tfile(tfile.parent.name);
		if(!note){
			return;
		}
		await this.plugin.editor.set_multi_frontmatter(
			note,
			{
				"FolderPrevNote":`[[${anchor.basename}]]`,
				"FolderPrevNoteOffset":0.5,
		    }
		)
	}
	
	async chain_suggester_tfiles(tfile=this.current_note,mode='suggester'){
		let notes = this.get_brothers(tfile);
		if(notes.length==0){return;}

		let files = await this.suggester_sort(notes);
		await this.chain_concat_tfiles(files);
	}

	sort_tfiles(files:Array<TFile>,field:any):any{
		if(typeof field === 'string'){
			if(field==='name' || field==='alphabetical'){
				return files.sort(
					(a,b)=>(a.name.localeCompare(b.name))
				);
			}else if(field==='mtime'|| field==='byModifiedTime'){
				return files.sort(
					(a,b)=>(a.stat?.mtime-b.stat?.mtime)
				)
			}else if(field==='ctime' || field==='byCreatedTime'){
				return files.sort(
					(a,b)=>(a.stat?.ctime-b.stat?.ctime)
				)
			}else if(field==='alphabeticalReverse'){
				return files.sort(
					(b,a)=>(a.name.localeCompare(b.name))
				);
			}else if(field==='byModifiedTimeReverse'){
				return files.sort(
					(b,a)=>(a.stat?.mtime-b.stat?.mtime)
				)
			}else if(field==='byCreatedTimeReverse'){
				return files.sort(
					(b,a)=>(a.stat?.ctime-b.stat?.ctime)
				)
			}else if(field==='chain'){
				return this.sort_tfiles_by_chain(files);
			}
			return files;
		}else if(typeof field === 'object'){
			if(field instanceof Array){
				let nfiles = this.sort_tfiles(files,field[0]);
				if(field.length>=2){
					if(field[1]==='x'){
						return nfiles.reverse()
					}
				}
				return nfiles;
			}
		}
		return files;
	}
	
	sort_tfiles_by_chain(tfiles:Array<TAbstractFile>){
		let notes = tfiles.filter(f=>f instanceof TFile);
		let res:TAbstractFile[] = [];
		let ctfiles:TFile[] = [];
		while(notes.length>0){
			let note = notes[0];
			if(note instanceof TFile){
				let xchain = this.get_chain(note,-1,-1);
				for(let x of xchain){
					if(notes.contains(x)){
						ctfiles.push(x);
						notes.remove(x);
					}
				}
			}
		}
		res.push(...ctfiles);
		let folders = tfiles.filter(f=>f instanceof TFolder);
		if(folders.length>0){
			let idxs = folders.map(
				(f:TFolder)=>this.indexOfFolder(f,ctfiles)
			);
			res.push(...folders);
			function indexOf(f:TAbstractFile){
				if(f instanceof TFile){
					return res.indexOf(f);
				}else if(f instanceof TFolder){
					return idxs[folders.indexOf(f)];
				}else{
					return -1;
				}
			}
			res = res.sort((a,b)=>indexOf(a)-indexOf(b));
		}
		return res;
	}

	sort_tfiles_folder_first(tfiles:Array<TFile>){
		let A = tfiles.filter(f=>f instanceof TFolder).sort((a,b)=>(a.name.localeCompare(b.name)));
		let B = tfiles.filter(f=>f instanceof TFile);
		return this.plugin.utils.concat_array([A,B]);
	}

	sort_tfiles_by_field(tfiles:Array<TFile>,field:string){
		let res = tfiles.sort(
			(a,b)=>{
				let av = this.editor.get_frontmatter(a,field);
				let bv = this.editor.get_frontmatter(b,field);
				return av - bv;
			}
		)
		return res;
	}

	async suggester_sort(tfiles:Array<TFile>){
		if(!tfiles){return [];}
		if(tfiles.length==0){return []};
		let kv = {
			'chain':'chain',
			'name (a to z)':'name',
			'ctime (old to new)':'ctime',
			'mtime (old to new)':'mtime',
			'name (z to a)':['name','x'],
			'ctime (new to old)':['ctime','x'],
			'mtime (new to old)':['mtime','x'],
		}
		let field = await this.tp_suggester(
			Object.keys(kv),
			Object.values(kv)
		);
		if(field==null){return [];}
		if(field=='chain'){
			tfiles = this.sort_tfiles(tfiles,'name');
		}
		return this.sort_tfiles(tfiles,field);
	}

	view_sort_by_chain(){
		let view = this.app.workspace.getLeavesOfType(
			"file-explorer"
		)[0]?.view as any;
		if(!view){return;}
		view.sort();
		if(view.ready){
			for(let path in view.fileItems){
				let item = view.fileItems[path];
				if(item.vChildren){
					let files = item.vChildren._children.map((f:any)=>f.file);
					files = this.sort_tfiles_by_chain(files);
					let children = item.vChildren._children.sort(
						(a:any,b:any)=>files.indexOf(a.file)-files.indexOf(b.file)
					)
					item.vChildren.setChildren(children);
				}
			}
			view.tree.infinityScroll.compute()
		}
	}

}