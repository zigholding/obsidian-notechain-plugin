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

	replace(tfile:TFile,regex:RegExp,target:string){
		this.app.vault.process(tfile,(data)=>{
			return data.replace(regex, target);
		})
	}
}

class NoteChain{
	app:App;
	prev:string;
	next:string;

	constructor(app:App,prev="PrevNote",next="NextNote") {
		this.app = app;
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
		let notes = tfile?.parent?.children.filter(
		f=>f.basename).filter(
			f=>f.extension==='md'
		);
		if(!notes){return [];}
		return notes;
	}

	async suggester_notes(tfile=this.current_note){
		let kv = [
			'当前笔记',
			'同级目录',
			'出链+入链',
			'入链',
			'出链',
		]
		let mode = await this.suggester(kv,kv);
		if(mode==='当前笔记'){
			return [tfile];
		}else if(mode==='同级目录'){
			return this.get_same_parent(tfile);
		}else if(mode==='出链+入链'){
			return this.get_links(tfile);
		}else if(mode==='入链'){
			return this.get_inlinks(tfile);
		}else if(mode==='出链'){
			return this.get_outlinks(tfile);
		}else{
			return [];
		}
	}


	get_first_note(tfile){
		let res = new Array();
		res.push(tfile);
		
		let tmp = tfile;
		while(true){
			let prev = this.get_prev_notes(tmp,this.prev,this.next,true);
			if(prev[0] && !res.includes(prev[1][0])){
				res.unshift(prev[1][0]);
				tmp = prev[1][0]
			}else{
				break;
			}
		}
		return tmp;
	}

	get_last_note(tfile){
		let res = new Array();
		res.push(tfile);
		let tmp = tfile;
		while(true){
			let next = this.get_next_notes(tmp,this.prev,this.next,true);
			if(next[0] && !res.includes(next[1][0])){
				res.push(next[1][0]);
				tmp = next[1][0];
				console.log(tmp);
			}else{
				break;
			}
		}
		return tmp;
	}

	get_file_chain(tfile=this.current_note,prev=10,next=10){
		let res = Array();
		res.push(tfile);
		
		let tmp = tfile;
		for(let i=prev;i!=0;i--){
			console.log(i);
			let meta = this.app.metadataCache.getFileCache(tmp);
			
			if(!meta){break}
	
			let name = meta.frontmatter?.PrevNote;
			if(!name){break}
	
			let note = this.get_tfile(name);
			if(!note){
				break;
			}else if(res.includes(note)){
				this.set_frontmatter(note,this.next,"");
				this.set_frontmatter(tmp,this.prev,"");
				break;
			}else{
				res.unshift(note);
				tmp = note;
			}
		}
	
		tmp = tfile;
		for(let i=next;i!=0;i--){
			let meta = this.app.metadataCache.getFileCache(tmp);
			
			if(!meta){break}
	
			let name = meta.frontmatter?.NextNote;
			if(!name){break}
	
			let note = this.get_tfile(name);
			if(!note){
				break;
			}else if(res.includes(note)){
				this.set_frontmatter(note,this.prev,"");
				this.set_frontmatter(tmp,this.next,"");
				break;
			}else{
				res.push(note);
				tmp = note;
			}
		}
	}

	get_prev_notes(tfile,prev="PrevNote",next="NextNote",onlyFrontmatter=true){
		// onlyFrontmatter，只搜索 frontmatter 中的链接
		let res = new Array();
		let notes = this.get_links(tfile);
		
		let meta = this.app.metadataCache.getFileCache(tfile);
		let flag = false;
		if(meta?.frontmatter){
			let name = meta.frontmatter[prev];
			if(name){
				let note = this.get_tfile(name,notes);
				res.push(note);
				flag = true;
			}
		}
		if(onlyFrontmatter){
			return [flag,res];
		}
		
		for(let note of notes){
			if(res.includes(note)){continue}
			if(!note){continue}

			let meta = this.app.metadataCache.getFileCache(note);
			if(meta?.frontmatter){
				let name = meta.frontmatter[next];
				if(this.get_tfile(name,[tfile])){
					res.push(note);
				}
			}
		}
		return [flag,res];
	}

	get_next_notes(tfile,prev="PrevNote",next="NextNote",onlyFrontmatter=true){
		return this.get_prev_notes(tfile,next,prev,onlyFrontmatter);
	}

	get_neighbors(tfile){
		let tmp = this.get_prev_notes(tfile,this.prev,this.next,true);
		let pflag = tmp[0];
		let prev = tmp[1];
		let tmp2 = this.get_next_notes(tfile,this.prev,this.next,true);
		let nflag = tmp2[0];
		let next = tmp2[1];

		if(pflag && nflag){
			return [prev[0],next[0]];
		}else if(pflag){
			return [prev[0],undefined];
		}else if(nflag){
			return [undefined,next[0]];
		}else{
			return [undefined,undefined];
		}
	}
	

	async set_frontmatter(tfile,key,value){
		await this.app.fileManager.processFrontMatter(tfile,fm =>{
			console.log(`${tfile.basename}---${key}---${value}`);
			fm[key] = value;
		});
	}

	get_frontmatter(tfile,key){
		let meta = this.app.metadataCache.getFileCache(tfile);
		if(meta?.frontmatter){
			return meta.frontmatter[key];
		}
	}

	pop_node(tfile){
		// 移除 tfile，关联前后
		let neighbor = this.get_neighbors(tfile);
		if(neighbor[0]!=null && neighbor[1]!=null){
			this.set_frontmatter(neighbor[0],this.next,`[[${neighbor[1].basename}]]`);
			this.set_frontmatter(neighbor[1],this.prev,`[[${neighbor[0].basename}]]`);
		}else if(neighbor[0]!=null){
			this.set_frontmatter(neighbor[0],this.next,``);
		}else if(neighbor[1]!=null){
			this.set_frontmatter(neighbor[1],this.prev,``);
		}
	}

	insert_node_as_head(tfile,anchor){
		// 将tfile 插到 anchor 所在链的头
		if(head==tfile){
			return;
		}
		let head = this.get_first_note(anchor);
		this.set_frontmatter(tfile,this.next,`[[${head.basename}]]`);
		this.set_frontmatter(head,this.prev,`[[${tfile.basename}]]`);
	}

	insert_node_as_tail(tfile,anchor){
		// 将tfile 插到 anchor 所在链的尾
		let tail = this.get_last_note(anchor);
		if(tfile==tail){
			return;
		}
		this.set_frontmatter(tfile,this.prev,`[[${tail.basename}]]`);
		this.set_frontmatter(tail,this.next,`[[${tfile.basename}]]`);
	}

	insert_node_after(tfile,anchor){
		let next = this.get_next_notes(anchor,this.prev,this.next,true);
		if(next[0] && next[1][0]!=tfile && next[1][0]!=anchor){
			this.set_frontmatter(next[1][0],this.prev,`[[${tfile.basename}]]`);
			this.set_frontmatter(tfile,this.next,`[[${next[1][0].basename}]]`);
		}

		this.set_frontmatter(tfile,this.prev,`[[${anchor.basename}]]`);
		this.set_frontmatter(anchor,this.next,`[[${tfile.basename}]]`);
	}

	insert_node_before(tfile,anchor){
		let prev = this.get_prev_notes(anchor,this.prev,this.next,true);
		if(prev[0] && prev[1][0]!=tfile && prev[1][0]!=anchor){
			this.set_frontmatter(prev[1][0],this.next,`[[${tfile.basename}]]`);
			this.set_frontmatter(tfile,this.prev,`[[${prev[1][0].basename}]]`);
		}

		this.set_frontmatter(tfile,this.next,`[[${anchor.basename}]]`);
		this.set_frontmatter(anchor,this.prev,`[[${tfile.basename}]]`);
	}
	
	async rechain_folder(tfolder=null,mode='suggester'){
		let notes = this.get_same_parent();
		let files = await this.suggester_sort(notes);
		
		for(let i=0;i<files.length-1;i++){
			if(!(this.get_frontmatter(files[i],this.next)===`[[${files[i+1].basename}]]`)){
				this.set_frontmatter(files[i],this.next,`[[${files[i+1].basename}]]`);
			}
			if(!(this.get_frontmatter(files[i+1],this.prev)===`[[${files[i].basename}]]`)){
				this.set_frontmatter(files[i+1],this.prev,`[[${files[i].basename}]]`);	
			}
		}
	}

	sort_tfiles(files,field){
		if(typeof field === 'string'){
			if(field.localeCompare("name")==0){
				return files.sort(
					(a,b)=>(a.name.localeCompare(b.name))
				);
			}else if(field.localeCompare("mtime")==0){
				return files.sort(
					(a,b)=>(a.stat.mtime-b.stat.mtime)
				)
			}else if(field.localeCompare("ctime")==0){
				return files.sort(
					(a,b)=>(a.stat.ctime-b.stat.ctime)
				)
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
	sort_tfiles_by_chain(files){

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

		this.chain = new NoteChain(this.app);
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
			name: 'Chain-->chain_insert_node',
			callback: () => {
				this.chain_insert_node();
			}
		});
		
		this.addCommand({
			id: 'chain_set_seq_note',
			name: 'Chian-->Auto Set Chain by ctime',
			callback: () => {
				this.yaml_set_seq_notes();
			}
		});

		this.addCommand({
			id: 'open_notes_in_same_folder',
			name: 'Open notes in same folder',
			callback: () => {
				this.open_notes_in_same_folder();
			}
		});

		this.addCommand({
			id: 'open_note_chain',
			name: 'Chain-->Open note chain',
			callback: () => {
				this.open_note_chain();
			}
		});


		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

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
				mode = await this.suggester(
					["删除链接","删除段落",],
					['link','para']
				);
			}
			let reg = this.editor.regexp_link(tfile,mode);
			if(reg){
				for(let note of notes){
					this.editor.replace(note,reg,'');
				}
			}
		}
	}


	get_tfile(path:string){
		// 根据路径获取 tfile，大小不敏感
		let files = app.vault.getMarkdownFiles();
		if(files.includes(path)){
			return files[path]
		}
		for(let file of files){
			if(file.name.toLowerCase().localeCompare(path.toLowerCase())==0){
				return file;
			}
			if(file.basename.toLowerCase().localeCompare(path.toLowerCase())==0){
				return file;
			}
			if(`[[${file.basename.toLowerCase()}]]`.localeCompare(path.toLowerCase())==0){
				return file;
			}
		}
		return null;
	}

	get_tfile_config(tfile,suffix="_config"){
		// 获取 tfile 对应的 config 文件
		return this.get_tfile(tfile.basename+suffix);
	}

	async select_value_of_list(targets,prompt=null){
		const target = await this.suggester(
			targets,targets,false,prompt
		); 
		return target;
	}

	async chain_insert_node(){
		// 选择笔记的后置笔记
		let curr = app.workspace.getActiveFile();

		let filteredFiles = app.vault.getMarkdownFiles().sort(
			(a,b)=>(b.stat.mtime-a.stat.mtime)
		);

		if(!this.settings.allFiles){
			filteredFiles = filteredFiles.filter(
				(file)=>file!=curr && file.parent==curr.parent
			);
		}else{
			filteredFiles = filteredFiles.filter(
				(file)=>file!=curr
			);
		}
		const note = await this.suggester(
			(file) => this.tfile_to_string(
					file,
					this.settings.showLink ? ["PrevNote","NextNote"] :[],
					"\t\t\t⚡  "
				), 
			filteredFiles
		); 
		
		if(!note){return;}

		let mode = await this.select_value_of_list([
			"insert_node_as_head",
			"insert_node_as_tail",
			"insert_node_before",
			"insert_node_after",
		],prompt="Select Node Insert Mode.");
		
		if(!mode){return;}

		console.log(typeof(mode),mode);
		if(this.settings.popFirst){
			this.chain.pop_node(curr);
		}

		if(mode.localeCompare("insert_node_as_head")==0){
			this.chain.insert_node_as_head(curr,note);
		}else if(mode.localeCompare("insert_node_as_tail")==0){
			this.chain.insert_node_as_tail(curr,note);
		}else if(mode.localeCompare("insert_node_before")==0){
			this.chain.insert_node_before(curr,note);
		}else if(mode.localeCompare("insert_node_after")==0){
			this.chain.insert_node_after(curr,note);
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

	yaml_set_seq_notes(){
		let curr = this.app.workspace.getActiveFile();
		let notes = this.chain.get_same_parent();
		let files = this.chain.suggester_sort(notes);

		for(let i=0;i<files.length-1;i++){
			let neighbor = this.chain.get_neighbors(files[i]);
			if(neighbor[0]==undefined && neighbor[1]==undefined){
				
			}
			let meta = this.app.metadataCache.getFileCache(files[i]);
			if(!meta | (!meta.frontmatter?.PrevNote && !meta.frontmatter?.NextNote)){
				this.yaml_set_prev_and_next_notes(files[i],files[i+1]);
			}
		}
		let meta = app.metadataCache.getFileCache(files[files.length-1]);
		if(!meta | (!meta.frontmatter?.PrevNote && !meta.frontmatter?.NextNote)){
			this.yaml_set_prev_and_next_notes(files[files.length-2],files[files.length-1]);
		}
	}

	async open_notes_in_same_folder(){
		let curr = this.app.workspace.getActiveFile();
		const filteredFiles_ = this.app.vault.getMarkdownFiles().filter(
			(file)=>(
				(file!=curr) | (this.settings?.withSelf)
			)&&(
				file.path.startsWith(curr.parent.path)
			)
		); 
		
		let filteredFiles = this.chain.sort_tfiles(
			filteredFiles_,
			this.settings.field,
		);
		

		const note = (
			await this.suggester(
				(file) => file.path.slice(curr.parent.path.length+1).slice(0,-3), filteredFiles
			)
		); 

		if(note){
			if(this.settings.newTab){
				app.workspace.getLeaf(true).openFile(note);
			}else{
				app.workspace.activeLeaf.openFile(note);
			}
		}
	}

	get suggester(){
		return get_tp_func(this.app,"tp.system.suggester");
	}
	
	get_file_chain(curr=null,prev=10,next=10,sameFolder=false){

		if(curr===null){
			curr = this.app.workspace.getActiveFile();
		}
		let res = Array();
		res.push(curr);
		
		let tmp = curr;
		for(let i=prev;i!=0;i--){
			let meta = this.app.metadataCache.getFileCache(tmp);
			
			if(!meta){break}
	
			let name = meta.frontmatter?.PrevNote;
			if(!name){break}
	
			let note = this.get_tfile(name);
			if(!note | res.includes(note)){
				break;
			}else{
				res.unshift(note);
				tmp = note;
			}
		}
	
		tmp = curr;
		for(let i=next;i!=0;i--){
			let meta = this.app.metadataCache.getFileCache(tmp);
			
			if(!meta){break}
	
			let name = meta.frontmatter?.NextNote;
			if(!name){break}
	
			let note = this.get_tfile(name);
			if(!note | res.includes(note)){
				break;
			}else{
				res.push(note);
				tmp = note;
			}
		}

		if(sameFolder){
			res.push(null);
			let afiles = this.app.vault.getMarkdownFiles()
			for(let f of afiles){
				if(f.parent == curr?.parent){
					if(!res.includes(f)){
						res.push(f);
					}
				}
			}
			res = res.filter(
				(file)=>(
					(file===null) | (file?.path.startsWith(curr.parent.path))
				)
			); 
		}
		return res;
	}

	async open_note_chain(){
		let curr = this.app.workspace.getActiveFile();
		let files = this.get_file_chain(
			curr,
			Number(this.settings.PrevChain),
			Number(this.settings.NextChain),
			this.settings.sameFolder,
		);

		const note = (
			await this.suggester(
				(file) => {
					if(!file){
						return '-----📂-----';
					}else if(file==curr){
						return `🏠 ${curr.basename}`;
					}else{
						return file.path.slice(curr.parent.path.length+1).slice(0,-3)
					}
				}, 
				files
			)
		); 
		 if(note){
			 if(this.settings.newTab){
				this.app.workspace.getLeaf(true).openFile(note);
			}else{
				this.app.workspace.activeLeaf.openFile(note);
			}
		 }
	}

}

class SampleSettingTab extends PluginSettingTab {
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
		// let s = new Setting(containerEl);
		// console.log("Setting--->",s);
	}
}
