
import { 
	App, Editor, MarkdownView, Modal, Notice, 
	Plugin, PluginSettingTab, Setting,
	TFile,TFolder
} from 'obsidian';

import {NoteChainPlugin} from "../main";
import {NCEditor} from './NCEditor';
import {get_tp_func} from './utils'

export class NoteChain{
	zig:NoteChainPlugin;
	app:App;
	prev:string;
	next:string;
	editor:NCEditor;

	constructor(zig:NoteChainPlugin,prev="PrevNote",next="NextNote") {
		this.zig = zig;
		this.app = zig.app;
		this.editor = new NCEditor(this.app);
		this.prev = prev;
		this.next = next;
		this.dv_api = this.app.plugins.getPlugin("dataview");
	}
    
	get find_tfile(){
		return get_tp_func(this.app,'tp.file.find_tfile');

	}

	get suggester(){
		return get_tp_func(this.app,'tp.system.suggester');
	}

	get_all_folders(sort_mode=''){
		return this.app.vault.getAllFolders();
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

	async move_file_to_another_folder(tfile=this.current_note){
		if(tfile==null){return;}

		let folders = this.get_all_folders();
		folders = this.sort_folders_by_mtime(folders
		).filter(f=>f!=tfile.parent);

		if(tfile.extension==='md'){
			folders = folders.filter((f:TFile)=>this.filter_user_ignore(f));
		}
		try {
			let folder = await this.suggester((f:TFile)=>f.path,folders);
			// 移动笔记
			let dst = folder.path+"/"+tfile.basename+"."+tfile.extension;
			await app.fileManager.renameFile(tfile,dst);
		} catch (error) {
			
		}
	}
	
	filter_user_ignore(note:TFile){
		if(!(this.app.vault.config.attachmentFolderPath==='./')){
			if(note.path.startsWith(
				this.app.vault.config.attachmentFolderPath)
			){
				return false;
			}
		}
		if(this.app.vault.config.userIgnoreFilters){
			for(let x of this.app.vault.config.userIgnoreFilters){
				if(note.path.startsWith(x)){
					return false;
				}
			}
		}
		return true;
	}

	async sugguster_note(){
		let notes = this.sort_tfiles(
			this.app.vault.getFiles(),
			['mtime','x']
		).filter((f:TFile)=>this.filter_user_ignore(f));
		try {
			let note = await this.suggester((f:TFile)=>f.path,notes);
			return note;
		} catch (error) {
		}
	}

	open_note(tfile:TFile,new_tab=false){
		if(tfile){
			if(this.app.workspace.activeLeaf.pinned || new_tab){
				return this.app.workspace.getLeaf(true).openFile(tfile);
			}else{
				return this.app.workspace.activeLeaf.openFile(tfile);
			}
		}
	}

	async sugguster_open_note(){
		try {
			let note = await this.sugguster_note();
			console.log(note);
			this.open_note(note);
		} catch (error) {
		}
	}



	get_tfile(path){
		let name = path.split('|')[0].replace('[[','').replace(']]','');
		return this.find_tfile(name);
	}

	get MDFiles(){
		return app.vault.getMarkdownFiles();
	}

	get current_note(){
		return this.app.workspace.getActiveFile();
	}

	get_inlinks(tfile=this.current_note){
		if(tfile==null){return [];}

		let res = new Array();

		let dv_api = this.app.plugins.getPlugin("dataview");

		let inlinks = dv_api.index.links.invMap.get(tfile.path);
		if(inlinks==undefined){
			return [];
		}else{
			return Array.from(inlinks).map(
				(path)=>(this.app.vault.fileMap[path])
			).filter(
				(item)=>(item)
			)
		}
	}

	get_outlinks(tfile=this.current_note){
		if(tfile==null){return [];}

		let res = new Array();
		let dv_api = this.app.plugins.getPlugin("dataview");
		let inlinks = dv_api.index.links.map.get(tfile.path);
		if(inlinks==undefined){
			return [];
		}else{
			return Array.from(inlinks).map(
				(path)=>(this.app.vault.fileMap[path])
			).filter(
				(item)=>(item)
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

	get_same_parent(tfile=this.current_note){
		return this.get_tfiles_of_folder(tfile?.parent,false);
	}

	get_tfiles_of_folder(tfolder:TFolder,with_children=true){
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

	parse_item(item){
		var args = [].slice.call(arguments).slice(1);
		let kwargs = {}
		if(args.length==1){
			kwargs = args[0];
		}
		let seq = kwargs['seq'];

		if(seq!=null){
			return `${seq} -> ${item}`;
		}
		return item;
	}

	tfile_to_string(tfile:TFile){
		let curr = this.current_note;
		let msg = '';
		if(tfile.parent==curr.parent){
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

	parse_items(items:Array<string|TFile>){
		var args = [].slice.call(arguments).slice(1);
		let kwargs = {}
		if(args.length==1){
			kwargs = args[0];
		}

		let res = [];
		let i = 0;
		while(i<items.length){
			if(kwargs['seq']){
				res.push(this.parse_item(items[i],{'seq':i+1}));
			}else{
				res.push(this.parse_item(items[i]));
			}
			
			i++;
		}
		return res;
	}

	async suggester_notes(tfile=this.current_note,curr_first=true,smode=''){
		let kv = [			
			'同级目录',
			'笔记链条',
			'同级目录+子目录',
			'出链+入链',
			'入链',
			'出链',
			'所有笔记',
			'recent-files-obsidian'
		]
		
		if(curr_first){
			kv.unshift('当前笔记')
		}else{
			kv.push('当前笔记')
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
			mode = await this.suggester(kvs,kv);
		}
		if(mode==='当前笔记'){
			return [tfile];
		}else if(mode==='同级目录'){
			return this.get_same_parent(tfile);
		}else if(mode==='同级目录+子目录'){
			return this.get_tfiles_of_folder(tfile?.parent,true);
		}else if(mode==='出链+入链'){
			return this.get_links(tfile);
		}else if(mode==='入链'){
			return this.get_inlinks(tfile);
		}else if(mode==='出链'){
			return this.get_outlinks(tfile);
		}else if(mode==='所有笔记'){
			return this.MDFiles;
		}else if(mode==='recent-files-obsidian'){
			let r = this.app.plugins.getPlugin("recent-files-obsidian");
			if(!r){return [];}
			return Object.values(
				r.data.recentFiles).map(f=>this.app.vault.fileMap[f.path]
			).filter(f=>f);
		}else if(mode==='笔记链条'){
			return this.get_chain(
				tfile,
				Number(this.zig.settings.PrevChain),
				Number(this.zig.settings.NextChain)
			);
		}else{
			return [];
		}
	}


	// Chain
	get_prev_note(tfile=this.current_note){
		if(tfile.deleted){
			let tfiles = this.app.vault.getMarkdownFiles();
			tfiles = tfiles.filter(f=>`[[${tfile.basename}]]`===this.editor.get_frontmatter(f,this.next));
			if(tfiles.length>0){
				return tfile[0];
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
		if(tfile.deleted){
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
				// 每次自动删除循环链接
				this.editor.set_frontmatter(note,this.next,"");
				this.editor.set_frontmatter(tmp,this.prev,"");
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
				// 每次自动删除循环链接
				this.editor.set_frontmatter(note,this.prev,"");
				this.editor.set_frontmatter(tmp,this.next,"");
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
	
	async chain_set_prev(tfile:TFile,prev:TFile){
		if(tfile==null || tfile==prev){return;}
		if(prev==null ){
			await this.editor.set_frontmatter(
				tfile,this.prev,''
			);
		}else{
			await this.editor.set_frontmatter(
				tfile,this.prev,`[[${prev.basename}]]`
			);
		}
	}

	async chain_set_next(tfile:TFile,next:TFile){
		if(tfile==null || tfile==next){return;}
		if(next==null ){
			await this.editor.set_frontmatter(
				tfile,this.next,''
			);
		}else{
			await this.editor.set_frontmatter(
				tfile,this.next,`[[${next.basename}]]`
			);
		}
	}

	async chain_set_prev_next(prev:TFile,next:TFile){
		await this.chain_set_prev(next,prev);
		await this.chain_set_next(prev,next);
	}

	async chain_pop_node(tfile:TFile){
		let notes = this.get_neighbors(tfile);
		await this.chain_set_prev_next(notes[0],notes[1]);
	}

	async chain_insert_node_as_head(tfile:TFile,anchor:TFile){
		let head = this.get_first_note(anchor);
		await this.chain_set_prev_next(tfile,head);
	}

	async chain_insert_node_as_tail(tfile:TFile,anchor:TFile){
		let tail = this.get_last_note(anchor);
		await this.chain_set_prev_next(tail,tfile);
	}

	async chain_insert_node_after(tfile:TFile,anchor:TFile){
		this.chain_pop_node(tfile);

		let next = this.get_next_note(anchor);
		await this.chain_set_prev_next(anchor,tfile);
		await this.chain_set_prev_next(tfile,next);
	}

	async chain_insert_node_before(tfile:TFile,anchor:TFile){
		this.chain_pop_node(tfile);
		let prev = this.get_next_note(anchor);
		await this.chain_set_prev_next(tfile,anchor);
		await this.chain_set_prev_next(prev,tfile);
	}

	async chain_link_tfiles(tfiles:Array<TFile>){
		let prev = this.get_prev_note(tfiles[0]);
		if(tfiles.contains(prev)){
			await this.chain_set_prev(tfiles[0],null);
		}

		let next = this.get_next_note(tfiles[tfiles.length-1]);
		if(tfiles.contains(next)){
			await this.chain_set_next(tfiles[tfiles.length-1],null);
		}
		

		for(let i=0;i<tfiles.length-1;i++){
			await this.chain_set_prev_next(tfiles[i],tfiles[i+1])
		}
	}
	
	async chain_suggester_tfiles(tfile=this.current_note,mode='suggester'){
		let notes = this.get_same_parent(tfile);
		if(notes.length==0){return;}

		let files = await this.suggester_sort(notes);
		await this.chain_link_tfiles(files);
	}

	sort_tfiles(files:Array<TFile>,field:any){
		if(typeof field === 'string'){
			if(field==='name'){
				return files.sort(
					(a,b)=>(a.name.localeCompare(b.name))
				);
			}else if(field==='mtime'){
				return files.sort(
					(a,b)=>(a.stat.mtime-b.stat.mtime)
				)
			}else if(field==='ctime'){
				return files.sort(
					(a,b)=>(a.stat.ctime-b.stat.ctime)
				)
			}
			else if(field==='chain'){
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
	
	sort_tfiles_by_chain(tfiles:Array<TFile>){
		let notes = tfiles.map(f=>f);
		let res = [];
		while(notes.length>0){
			let note = notes[0];
			let tmp = [];
			let xchain = this.get_chain(note,-1,-1);
			for(let x of xchain){
				if(notes.contains(x)){
					tmp.push(x);
					notes.remove(x);
				}
			}
			res.push(tmp);
		}
		res = res.sort((a,b)=>b.length-a.length);
		let rres = [];
		for(let i of res){
			for(let j of i){
				rres.push(j);
			}
		}
		return rres;
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
			'name':'name',
			'ctime':'ctime',
			'mtime':'mtime',
			'name 倒序':['name','x'],
			'ctime 倒序':['ctime','x'],
			'mtime 倒序':['mtime','x'],
		}
		let field = await this.suggester(
			Object.keys(kv),
			Object.values(kv)
		);
		if(field==null){return [];}
		return this.sort_tfiles(tfiles,field);
	}

	view_sort_by_chain(){
		let view = this.app.workspace.getLeavesOfType(
			"file-explorer"
		)[0]?.view;
		if(!view){return;}
		view.sort();
		if(view.ready){
			for(let path in view.fileItems){
				let item = view.fileItems[path];
				if(item.vChildren){
					let files = item.vChildren._children.map(f=>f.file);
					files = this.sort_tfiles_by_chain(files);
					let children = item.vChildren._children.sort(
						(a,b)=>files.indexOf(a.file)-files.indexOf(b.file)
					)
					item.vChildren.setChildren(children);
				}
			}
			view.tree.infinityScroll.compute()
		}
	}

}