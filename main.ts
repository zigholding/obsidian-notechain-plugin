import { 
	App, Editor, MarkdownView, Modal, Notice, 
	Plugin, PluginSettingTab, Setting,
	DataviewPlugin,
	TFile,TFolder
} from 'obsidian';

// Remember to rename these classes and interfaces!

interface ZigSettings {
	newTab: boolean;
	withSelf:boolean;
	reverse:boolean;
	field:string;
	PrevChain:string;
	NextChain:string;
	showLink:boolean;
	openLink:boolean;
	refreshDataView:boolean;
	refreshTasks:boolean,
}

const DEFAULT_SETTINGS: ZigSettings = {
	newTab : true,
	withSelf : true,
	reverse : true,
	field : "NID",
	PrevChain : "10",
	NextChain : "10",
	showLink : true,
	openLink : true,
	refreshDataView : true,
	refreshTasks : true
}

function get_tp_func(app:App,target:string) {
	// 获取  templater 函数
	// get_tp_func("tp.system.prompt")

	let templater = app.plugins.getPlugin(
		"templater-obsidian"
	);

	let items = target.split(".");
	if(items[0].localeCompare("tp")!=0 || items.length!=3){return undefined;}
	
	let modules = templater.templater.functions_generator.
		internal_functions.modules_array.filter(
			(item)=>(item.name.localeCompare(items[1])==0)
		);

	if(modules.length==0){return undefined}
	
	return modules[0].static_functions.get(items[2]);
}



class ZigEditor{
	app:App;

	constructor(app:App){
		this.app = app;
	}

	async set_frontmatter(tfile:TFile,key:string,value:string){
		let prev = this.get_frontmatter(tfile,key);
		if(prev===value){return;}

		await this.app.fileManager.processFrontMatter(tfile,fm =>{
			console.log(`${tfile.basename}---${key}---${value}`);
			fm[key] = value;
		});
	}

	get_frontmatter(tfile:TFile,key:string){
		let meta = this.app.metadataCache.getFileCache(tfile);
		if(meta?.frontmatter){
			return meta.frontmatter[key];
		}
	}

	regexp_link(tfile:TFile,mode:string){
		//[[note||alias]]
		if(mode==='link'){
			return new RegExp(`\\[\\[${tfile.basename}\\|?.*\\]\\]`,'g');
		}
		
		//paragraph
		if(mode==='para'){
			return new RegExp(`.*\\[\\[${tfile.basename}\\|?.*\\]\\].*`,'g');
		}
	}

	replace(tfile:TFile,regex,target:string){
		if(typeof regex === 'string'){
			this.app.vault.process(tfile,(data)=>{
				if(data.indexOf(regex)>-1){
					console.log('Replace: ',tfile.path);
					return data.replace(regex, target);
				}
				return data;
			})
		}else if(regex instanceof RegExp){
			this.app.vault.process(tfile,(data)=>{
				if(data.match(regex)){
					console.log('Replace: ',tfile.path);
					return data.replace(regex, target);
				}
				return data;
			})
		}
	}
}

class NoteChain{
	zig:ZigHolding;
	app:App;
	prev:string;
	next:string;
	editor:ZigEditor;

	constructor(zig:ZigHolding,prev="PrevNote",next="NextNote") {
		this.zig = zig;
		this.app = zig.app;
		this.editor = new ZigEditor(this.app);
		this.prev = prev;
		this.next = next;

		this.dv_api = this.app.plugins.getPlugin(
			"dataview"
		);
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
				...f.children.filter(f=>f.basename).map(f=>f.stat
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
		let folders = this.get_all_folders();
		folders = this.sort_folders_by_mtime(folders
		).filter(f=>f!=tfile.parent);

		if(tfile.extension==='md'){
			folders = folders.filter(f=>this.filter_user_ignore(f));
		}
		try {
			let folder = await this.suggester((f)=>f.path,folders);
			// 移动笔记
			let dst = folder.path+"/"+tfile.basename+"."+tfile.extension;
			await app.fileManager.renameFile(tfile,dst);
		} catch (error) {
			
		}
	}
	
	filter_user_ignore(note){
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
		).filter(f=>this.filter_user_ignore(f));
		try {
			let note = await this.suggester(f=>f.path,notes);
			return note;
		} catch (error) {
		}
	}

	open_note(tfile:TFile,new_tab=false){
		if(tfile){
			if(this.app.workspace.activeLeaf.pinned || new_tab){
				this.app.workspace.getLeaf(true).openFile(tfile);
			}else{
				this.app.workspace.activeLeaf.openFile(tfile);
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
		let res = new Array();

		let inlinks = this.dv_api.index.links.invMap.get(tfile.path);
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
		let res = new Array();
		let inlinks = this.dv_api.index.links.map.get(tfile.path);
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
			if(c.basename && c.extension==='md'){
				notes.push(c);
			}else if(c.children && with_children){
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
		let mode = '';
		if(kv.contains(smode)){
			mode = smode;
		}else{
			mode = await this.suggester(kv,kv);
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
			return this.get_file_chain(
				tfile,
				Number(this.zig.settings.PrevChain),
				Number(this.zig.settings.NextChain)
			);
		}else{
			return [];
		}
	}


	// Chain
	get_file_chain(tfile=this.current_note,prev=10,next=10,with_self=true){
		let res = new Array();
		if(with_self){
			res.push(tfile);
		}
		
		let tmp = tfile;
		for(let i=prev;i!=0;i--){
			let name = this.editor.get_frontmatter(tmp,this.prev);
			if(!name){break}
	
			let note = this.get_tfile(name);
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
			let name = this.editor.get_frontmatter(tmp,this.next);
			if(!name){break}
	
			let note = this.get_tfile(name);
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
		let notes = this.get_file_chain(tfile,-1,0,false);
		if(notes.length>0){
			return notes[0];
		}else{
			return null;
		}
	}

	get_last_note(tfile=this.current_note){
		let notes = this.get_file_chain(tfile,0,-1,false);
		if(notes.length>0){
			return notes[notes.length-1];
		}else{
			return null;
		}
	}

	get_prev_note(tfile=this.current_note){
		let notes = this.get_file_chain(tfile,1,0,false);
		if(notes.length>0){
			return notes[0];
		}else{
			return null;
		}
	}

	open_prev_notes(tfile=this.current_note){
		let note = this.get_prev_note(tfile);
		this.open_note(note);
	}

	get_next_note(tfile=this.current_note){
		let notes = this.get_file_chain(tfile,0,1,false);
		if(notes.length>0){
			return notes[notes.length-1];
		}else{
			return null;
		}
	}

	open_next_notes(tfile=this.current_note){
		let note = this.get_next_note(tfile);
		this.open_note(note);
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

	async insert_node_before(tfile:TFile,anchor:TFile){
		this.chain_pop_node(tfile);
		let prev = this.get_next_note(anchor);
		await this.chain_set_prev_next(tfile,anchor);
		await this.chain_set_prev_next(prev,tfile);
	}
	
	async rechain_folder(tfile=this.current_note,mode='suggester'){
		let notes = this.get_same_parent(tfile);
		let files = await this.suggester_sort(notes);
		for(let i=0;i<files.length-1;i++){
			await this.chain_set_prev_next(files[i],files[i+1])
		}
	}

	sort_tfiles(files:Array<TFile>,field){
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
			let xchain = this.get_file_chain(note,-1,-1);
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

	sort_tfiles_by_field(files,field){
		let res = files.sort(
			(a,b)=>{
				let ameta = this.app.metadataCache.getFileCache(a).frontmatter;
				let bmeta = this.app.metadataCache.getFileCache(b).frontmatter;
				if(!ameta && !bmeta){
					return 0;
				}else if(!ameta){
					return bmeta[field];
				}else if(!bmeta){
					return ameta[mode];
				}else{
					return ameta[field]-bmeta[field];
				}
			}
		)
		return res;
	}

	async suggester_sort(tfiles){
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
		return this.sort_tfiles(tfiles,field);
	}

}

export default class ZigHolding extends Plugin {
	settings: ZigSettings;
	chain : NoteChain;
	editor : ZigEditor; 

	async onload() {

		this.chain = new NoteChain(this);

		this.editor = new ZigEditor(this.app);
		this.app.zig = this;


		await this.loadSettings();
		
		this.dataview = await this.app.plugins.getPlugin(
			"dataview"
		);

		this.templater = await this.app.plugins.getPlugin(
			"templater-obsidian"
		)

		this.addCommand({
			id: 'chain_insert_node',
			name: 'Insert node of chain',
			callback: () => {
				this.chain_insert_node();
			}
		});
		
		this.addCommand({
			id: 'chain_set_seq_note',
			name: 'Reset the chain of current folder! Warning: It will reset your chain',
			callback: () => {
				this.chain.rechain_folder();
			}
		});

		this.addCommand({
			id: 'open_notes_smarter',
			name: 'Open note smarter',
			callback: () => {
				this.open_note_smarter();
			}
		});

		this.addCommand({
			id: 'sugguster_open_note',
			name: 'Open note',
			callback: () => {
				this.chain.sugguster_open_note();
			}
		});

		this.addCommand({
			id: 'open_prev_notes',
			name: 'Open prev note',
			callback: () => {
				this.chain.open_prev_notes();
			}
		});

		this.addCommand({
			id: 'open_next_notes',
			name: 'Open next note',
			callback: () => {
				this.chain.open_next_notes();
			}
		});


		this.addCommand({
			id: 'clear_inlinks',
			name: 'Clear inlinks of current file',
			callback: () => {
				this.clear_inlinks();
			}
		});

		this.addCommand({
			id: 'move_file_to_another_folder',
			name: 'Move current file to another folder',
			callback: () => {
				this.chain.move_file_to_another_folder();
			}
		});
		
		this.addCommand({
			id: 'replace_notes_with_regx',
			name: 'Replace by regex',
			callback: () => {
				this.replace_notes_with_regx();
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new ZigSettingTab(this.app, this));

		console.log('Zig-Holding:regeister ufunc_on_file_open');
		this.app.workspace.on('file-open', this.ufunc_on_file_open);
	}

	onunload() {
		console.log('Zig-Holding:unregeister ufunc_on_file_open');
		this.app.workspace.off('file-open', this.ufunc_on_file_open);
	}

	async ufunc_on_file_open(file){
		let zh = await app.plugins.getPlugin("zig-holding");
		if(!zh){return;}
		if(zh.settings.refreshDataView){
			zh.app.commands.executeCommandById(
				"dataview:dataview-force-refresh-views"
			)
		}
		if(zh.settings.refreshTasks){
			let target = await app.plugins.getPlugin("obsidian-tasks-plugin");
			target.cache.notifySubscribers();
		}
	}
	
	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async clear_inlinks(tfile=this.chain.current_note,mode='suggester'){
		let notes = this.chain.get_inlinks(tfile);
		if(notes.length){
			if(mode==='suggester'){
				mode = await this.chain.suggester(
					["删除链接",'替换链接',"删除段落",],
					[['link','del'],['link','rep'],['para','del']]
				);
			}
			let reg = this.editor.regexp_link(tfile,mode[0]);
			if(reg){
				for(let note of notes){
					let target;
					if(mode[1]==='rep'){
						target=tfile.basename;
					}else{
						target=''
					}
					this.editor.replace(note,reg,target);
				}
			}
		}
	}

	get prompt(){
		return get_tp_func(this.app,'tp.system.prompt');
	}

	async replace_notes_with_regx(){
		let notes = await this.chain.suggester_notes();
		if(notes?.length>0){
			try {
				let regs = await this.prompt('要替换的正则表达式');
				if(regs==null){
					return;
				}
				let reg = new RegExp(regs,'g');
				
				let target = await this.prompt('目标字符串');
				if(target==null){
					return;
				}
				target = target.trim().replace(
					/\\n/g,'\n'
				);
				console.log(regs,reg,target);
				for(let note of notes){
					await this.editor.replace(note,reg,target);
				}
			} catch (error) {
				console.log(error);
			}
			
		}
	}
	
	async chain_insert_node(){

		let curr = this.chain.current_note;
		let notes = this.chain.get_tfiles_of_folder(curr?.parent,false);
		notes = this.chain.sort_tfiles(notes,['mtime','x']);
		notes = this.chain.sort_tfiles_by_chain(notes);
		notes = notes.filter(f=>f!=curr);

		const note = await this.chain.suggester(
			(file) => this.tfile_to_string(
					file,
					this.settings.showLink ? ["PrevNote","NextNote"] :[],
					"\t\t\t⚡  "
				), 
				notes
		); 
		
		if(!note){return;}
		
		let sitems = [
			"insert_node_after",
			"insert_node_before",
			"insert_node_as_head",
			"insert_node_as_tail",
		];
		let mode = await this.chain.suggester(
			sitems,sitems,false,"Select Node Insert Mode."
		);
		
		if(!mode){return;}

		console.log(typeof(mode),mode);
		if(this.settings.popFirst){
			this.chain.chain_pop_node(curr);
		}

		if(mode==='insert_node_as_head'){
			this.chain.chain_insert_node_as_head(curr,note);
		}else if(mode==='insert_node_as_tail'){
			this.chain.chain_insert_node_as_tail(curr,note);
		}else if(mode==='insert_node_before'){
			this.chain.insert_node_before(curr,note);
		}else if(mode==='insert_node_after'){
			this.chain.chain_insert_node_after(curr,note);
		}else{
			return;
		}

		if(this.settings.openLink){
			if(note){
				if(this.settings.newTab){
					this.app.workspace.getLeaf(true).openFile(note);
				}else{
					this.app.workspace.activeLeaf.openFile(note);
				}
			 }
		 }
	}
	
	tfile_to_string(tfile,fields,seq){
		let meta = this.app.metadataCache.getFileCache(tfile);
		let items = new Array();
		items.push(tfile.basename)
		for(let field of fields){
			try{
				items.push(meta.frontmatter[field]);
			}catch(error){
				items.push("-");
			}
		}
		return items.join(seq);
	}

	async open_note_smarter(){
		let curr = this.chain.current_note;
		let notes = await this.chain.suggester_notes(curr,false);
		notes = this.chain.sort_tfiles(notes,['mtime','x']);
		notes = this.chain.sort_tfiles_by_chain(notes);

		const note = (
			await this.chain.suggester(
				(file) => file.path, 
				notes
			)
		); 
		
		await this.chain.open_note(note);
	}

}

class ZigSettingTab extends PluginSettingTab {
	plugin: ZigHolding;

	constructor(app: App, plugin: ZigHolding) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl("h1", { text: "Zig Holding" });

		containerEl.createEl("h3", { text: "Switch Note" });

		new Setting(containerEl)
			.setName('newTab')
			.setDesc('是否在新标签中打开笔记?')
			.addToggle(text => text
				.setValue(this.plugin.settings.newTab)
				.onChange(async (value) => {
					this.plugin.settings.newTab = value;
					await this.plugin.saveSettings();
				})
			);
		
		new Setting(containerEl)
			.setName('withSelf')
			.setDesc('是否显示当前笔记?')
			.addToggle(text => text
				.setValue(this.plugin.settings.withSelf)
				.onChange(async (value) => {
					this.plugin.settings.withSelf = value;
					await this.plugin.saveSettings();
				})
			);
		
		containerEl.createEl("h4", { text: "Open note in same folder" });

		new Setting(containerEl)
			.setName('reverse')
			.setDesc('是否逆向排序?')
			.addToggle(text => text
				.setValue(this.plugin.settings.reverse)
				.onChange(async (value) => {
					this.plugin.settings.reverse = value;
					await this.plugin.saveSettings();
				})
			);
		
		new Setting(containerEl)
			.setName('field')
			.setDesc('笔记排序字段：mtime，修改时间；ctime，创建时间；name,文件名；或其它元数据字段。')
			.addText(text => text
				.setValue(this.plugin.settings.field)
				.onChange(async (value) => {
					this.plugin.settings.field = value;
					await this.plugin.saveSettings();
				}));
		
		containerEl.createEl("h4", { text: "Open note chain" });
		new Setting(containerEl)
			.setName('PrevChain')
			.setDesc('前置笔记数目')
			.addText(text => text
				.setValue(this.plugin.settings.PrevChain)
				.onChange(async (value) => {
					this.plugin.settings.PrevChain = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('NextChain')
			.setDesc('后置笔记数目')
			.addText(text => text
				.setValue(this.plugin.settings.NextChain)
				.onChange(async (value) => {
					this.plugin.settings.NextChain = value;
					await this.plugin.saveSettings();
				}));
		
		new Setting(containerEl)
				.setName('sameFolder')
				.setDesc('仅显示当前文件夹中链路，同时展示不在链路的文件')
				.addToggle(text => text
					.setValue(this.plugin.settings.sameFolder)
					.onChange(async (value) => {
						this.plugin.settings.sameFolder = value;
						await this.plugin.saveSettings();
					})
				);
			
		containerEl.createEl("h3", { text: "Note Chain" });
		new Setting(containerEl)
				.setName('showLink')
				.setDesc('是否选择时显示笔记链接')
				.addToggle(text => text
					.setValue(this.plugin.settings.showLink)
					.onChange(async (value) => {
						this.plugin.settings.showLink = value;
						await this.plugin.saveSettings();
					})
				);

		new Setting(containerEl)
				.setName('popFirst')
				.setDesc('插入前链接当前笔记前后置笔记')
				.addToggle(text => text
					.setValue(this.plugin.settings.popFirst)
					.onChange(async (value) => {
						this.plugin.settings.popFirst = value;
						await this.plugin.saveSettings();
					})
				);

		new Setting(containerEl)
				.setName('openLink')
				.setDesc('选择后是否打开笔记')
				.addToggle(text => text
					.setValue(this.plugin.settings.openLink)
					.onChange(async (value) => {
						this.plugin.settings.openLink = value;
						await this.plugin.saveSettings();
					})
				);

		new Setting(containerEl)
				.setName('allFiles')
				.setDesc('是否从所有笔记中选择')
				.addToggle(text => text
					.setValue(this.plugin.settings.allFiles)
					.onChange(async (value) => {
						this.plugin.settings.allFiles = value;
						await this.plugin.saveSettings();
					})
				);
		
		containerEl.createEl("h3", { text: "初始化" });
		new Setting(containerEl)
				.setName('refreshDataView')
				.setDesc('打开新笔记时刷新Dataview？')
				.addToggle(text => text
					.setValue(this.plugin.settings.refreshDataView)
					.onChange(async (value) => {
						this.plugin.settings.refreshDataView = value;
						await this.plugin.saveSettings();
					})
				);
		new Setting(containerEl)
				.setName('refreshTasks')
				.setDesc('打开新笔记时刷新Tasks？')
				.addToggle(text => text
					.setValue(this.plugin.settings.refreshTasks)
					.onChange(async (value) => {
						this.plugin.settings.refreshTasks = value;
						await this.plugin.saveSettings();
					})
				);
	}
}
