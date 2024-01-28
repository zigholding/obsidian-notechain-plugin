import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	newTab: boolean;
	withSelf:boolean;
	reverse:boolean;
	field:string;
	PrevChain:string;
	NextChain:string;
	showLink:boolean;
	openLink:boolean;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	newTab : true,
	withSelf : true,
	reverse : true,
	field : "NID",
	PrevChain : "10",
	NextChain : "10",
	showLink : true,
	openLink : true
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
	templaterPlugin: TemplaterPlugin;

	async onload() {

		await this.loadSettings();
		
		this.dataview = this.app.plugins.getPlugin(
			"dataview"
		);

		this.templater = this.app.plugins.getPlugin(
			"templater-obsidian"
		)

		// // This creates an icon in the left ribbon.
		// const ribbonIconEl = this.addRibbonIcon('dice', 'Sample Plugin', (evt: MouseEvent) => {
		// 	// Called when the user clicks the icon.
		// 	new Notice('This is a notice!');
		// });
		// // Perform additional things with the ribbon
		// ribbonIconEl.addClass('my-plugin-ribbon-class');

		// // This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		// const statusBarItemEl = this.addStatusBarItem();
		// statusBarItemEl.setText('Status Bar Text');

		// // This adds a simple command that can be triggered anywhere
		// this.addCommand({
		// 	id: 'open-sample-modal-simple',
		// 	name: 'Open sample modal (simple)',
		// 	callback: () => {
		// 		new SampleModal(this.app).open();
		// 	}
		// });
		// // This adds an editor command that can perform some operation on the current editor instance
		// this.addCommand({
		// 	id: 'sample-editor-command',
		// 	name: 'Sample editor command',
			// editorCallback: (editor: Editor, view: MarkdownView) => {
			// 	console.log(editor.getSelection());
			// 	editor.replaceSelection('Sample Editor Command');
			// }
		// });
		// // This adds a complex command that can check whether the current state of the app allows execution of the command
		// this.addCommand({
		// 	id: 'open-sample-modal-complex',
		// 	name: 'Open sample modal (complex)',
		// 	checkCallback: (checking: boolean) => {
		// 		// Conditions to check
		// 		const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
		// 		if (markdownView) {
		// 			// If checking is true, we're simply "checking" if the command can be run.
		// 			// If checking is false, then we want to actually perform the operation.
		// 			if (!checking) {
		// 				new SampleModal(this.app).open();
		// 			}

		// 			// This command will only show up in Command Palette when the check function returns true
		// 			return true;
		// 		}
		// 	}
		// });

		this.addCommand({
			id: 'chain_select_prev_note',
			name: 'Chain-->Select Prev Note',
			callback: () => {
				this.yaml_select_prev_note();
			}
		});
		
		this.addCommand({
			id: 'chain_select_next_note',
			name: 'Chain-->Select Next Note',
			callback: () => {
				this.yaml_select_next_note();
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

		// // If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// // Using this function will automatically remove the event listener when this plugin is disabled.
		// this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
		// 	console.log(this.app);
		// });

		// // When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		// this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
	
	get_tp_func(target:string) {
		// 获取  templater 函数
		// get_tp_func("tp.system.prompt")
		let items = target.split(".");
		if(items[0].localeCompare("tp")!=0 | items.length!=3){return undefined;}
		
		let modules = this.templater.templater.functions_generator.
			internal_functions.modules_array.filter(
				(item)=>(item.name.localeCompare(items[1])==0)
			);

		if(modules.length==0){return undefined}
		
		return modules[0].static_functions.get(items[2]);

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

	yaml_set_prev_and_next_notes(pre,nxt){
		// pre的后置设为nxt，nxt的前置设为pre
		if(!pre){return;}
		if(!nxt){return;}
		
		this.app.fileManager.processFrontMatter(nxt,fm =>{
			fm["PrevNote"] = `[[${pre.basename}]]`;
		});
		
		this.app.fileManager.processFrontMatter(pre,fm =>{
			fm["NextNote"] = `[[${nxt.basename}]]`;
		});
	}

	async yaml_select_next_note(){
		// 选择笔记的后置笔记
		let curr = app.workspace.getActiveFile();

		let filteredFiles = app.vault.getMarkdownFiles().sort(
			(a,b)=>(b.stat.mtime-a.stat.mtime)
		);

		if(!this.settings.allFiles){
			filteredFiles = filteredFiles.filter(
				(file)=>file!=curr & file.parent==curr.parent
			);
		}
		let func = this.get_tp_func("tp.system.suggester");
		const note = await func(
			(file) => this.tfile_to_strint(
					file,
					this.settings.showLink ? ["PrevNote"] :[],
					"\t\t\t⚡  "
				), 
			filteredFiles
		); 
		this.yaml_set_prev_and_next_notes(curr,note);
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
	
	tfile_to_strint(tfile,fields,seq){
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

	async yaml_select_prev_note(){
		// 选择笔记的后置笔记
		let curr = this.app.workspace.getActiveFile();

		let filteredFiles = app.vault.getMarkdownFiles().sort(
			(a,b)=>(b.stat.mtime-a.stat.mtime)
		);

		if(!this.settings.allFiles){
			filteredFiles = filteredFiles.filter(
				(file)=>file!=curr & file.parent==curr.parent
			);
		}

		let func = this.get_tp_func("tp.system.suggester");

		if(this.settings.showLink){
			["NextNote"]
		}else{[]}

		const note = await func(
				(file) => this.tfile_to_strint(
					file,
					this.settings.showLink ? ["NextNote"] :[],
					"\t\t\t⚡  "
				), 
				filteredFiles
		); 
		this.yaml_set_prev_and_next_notes(note,curr);
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

	yaml_set_seq_notes(){
		let curr = this.app.workspace.getActiveFile();
		const files = this.app.vault.getMarkdownFiles().filter(
			file=>{
				return file.parent==curr.parent;
			}
		).sort(
			(a,b)=>(a.stat.ctime-b.stat.ctime)
		);

		for(let i=0;i<files.length-1;i++){
			let meta = this.app.metadataCache.getFileCache(files[i]);
			if(!meta | (!meta.frontmatter?.PrevNote & !meta.frontmatter?.NextNote)){
				this.yaml_set_prev_and_next_notes(files[i],files[i+1]);
			}
		}
		let meta = app.metadataCache.getFileCache(files[files.length-1]);
		if(!meta | (!meta.frontmatter?.PrevNote & !meta.frontmatter?.NextNote)){
			this.yaml_set_prev_and_next_notes(files[files.length-2],files[files.length-1]);
		}
	}

	async open_notes_in_same_folder(){
		let curr = this.app.workspace.getActiveFile();
		const filteredFiles_ = this.app.vault.getMarkdownFiles().filter(
			(file)=>(
				(file!=curr) | (this.settings?.withSelf)
			)&(
				file.path.startsWith(curr.parent.path)
			)
		); 
		
		let filteredFiles = this.sort_tfiles(
			filteredFiles_,
			this.settings.field,
			this.settings.reverse
		);
		
		let func = this.get_tp_func("tp.system.suggester");

		const note = (
			await func(
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


	xreverse(res,reverse){
		if(reverse){
			return res.reverse()
		}else{
			return res;
		}
	}

	sort_tfiles(files,field,reverse=false){
		var res;
		if(field.localeCompare("name")==0){
			res = files.sort(
				(a,b)=>(a.name.localeCompare(b.name))
			);
		}else if(field.localeCompare("mtime")==0){
			res = files.sort(
				(a,b)=>(a.stat.mtime-b.stat.mtime)
			)
		}else if(field.localeCompare("ctime")==0){
			res = files.sort(
				(a,b)=>(a.stat.ctime-b.stat.ctime)
			)
		}else if(field.localeCompare("chain")==0){
			res = files.sort(
				(a,b)=>{
					let ameta = this.app.metadataCache.getFileCache(a).frontmatter;
					let bmeta = this.app.metadataCache.getFileCache(b).frontmatter;
					if(!ameta & !bmeta){
						return 0;
					}else if(!ameta){
						return bmeta[field];
					}else if(!bmeta){
						return ameta[field];
					}else{
						return ameta[field]-bmeta[field];
					}
				}
			)
		}else{
			res = files.sort(
				(a,b)=>{
					let ameta = this.app.metadataCache.getFileCache(a).frontmatter;
					let bmeta = this.app.metadataCache.getFileCache(b).frontmatter;
					if(!ameta & !bmeta){
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
		}
		return this.xreverse(res,reverse);
	
		
	}

	get_file_chain(curr=null,prev=10,next=10,sameFolder=false){

		if(curr===null){
			curr = this.app.workspace.getActiveFile();
		}
		let res = Array();
		res.push(curr);
		
		let tmp = curr;
		for(let i=prev;i!=0;i--){
			console.log(i);
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
		console.log(files);

		let func = this.get_tp_func("tp.system.suggester");

		const note = (
			await func(
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

// class SampleModal extends Modal {
// 	constructor(app: App) {
// 		super(app);
// 	}

// 	onOpen() {
// 		const {contentEl} = this;
// 		contentEl.setText('Woah!');
// 	}

// 	onClose() {
// 		const {contentEl} = this;
// 		contentEl.empty();
// 	}
// }

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
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

		// let s = new Setting(containerEl);
		// console.log("Setting--->",s);
	}
}
