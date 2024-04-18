import { 
	App, Editor, MarkdownView, Modal, Notice, 
	Plugin, PluginSettingTab, Setting,
	TFile,TFolder
} from 'obsidian';


import {NCEditor} from './src/NCEditor';
import {NoteChain} from './src/NoteChain';
import {NCFileExplorer} from './src/NCFileExplorer';
import {get_tp_func} from './src/utils'

// Remember to rename these classes and interfaces!

interface NCSettings {
	PrevChain:string;
	NextChain:string;
	refreshDataView:boolean;
	refreshTasks:boolean,
	isSortFileExplorer:boolean,
	isFolderFirst:boolean,
}

const DEFAULT_SETTINGS: NCSettings = {
	PrevChain : "10",
	NextChain : "10",
	refreshDataView : true,
	refreshTasks : true,
	isSortFileExplorer : true,
	isFolderFirst : true
}

const longform2notechain = (plugin:NoteChainPlugin) => ({
	id: "longform2notechain",
    name: "Reset Note Chain by LongForm.",
	callback: () => {
		let curr = plugin.chain.current_note;
		if(curr == null){return;}
		app.fileManager.processFrontMatter(
			curr,
			fm =>{
				if(curr==null){return;}
				if(fm['longform']==null){return;}
				let scenes = plugin.editor.concat_array(fm.longform.scenes);
				let ignoredFiles = plugin.editor.concat_array(fm.longform.ignoredFiles);
				ignoredFiles = ignoredFiles.filter((f:string)=>!scenes.contains(f));
				let notes = plugin.editor.concat_array([scenes,ignoredFiles]);
				notes = notes.map((f:string)=>plugin.chain.find_tfile(f));
				if(curr.parent==null){return};
				let tfiles = plugin.chain.get_tfiles_of_folder(curr.parent).filter((f:any)=>!notes.contains(f));
				notes = plugin.editor.concat_array([tfiles,notes]);
				plugin.chain.chain_link_tfiles(notes);
			}
		)
	}
});

const longform4notechain = (plugin:NoteChainPlugin) => ({
	id: "longform4notechain",
    name: "Reset LongForm Secnes by Note Chain.",
	callback: () => {
		let curr = plugin.chain.current_note;
		if(curr==null){return;}
		app.fileManager.processFrontMatter(
			curr,
			fm =>{
				if(curr==null){return;}
				if(curr.parent==null){return};

				if(fm['longform']==null){return;}
				let notes = plugin.chain.get_tfiles_of_folder(curr.parent);
				notes = plugin.chain.sort_tfiles_by_chain(notes);
				fm.longform.scenes = notes.map((f:TFile)=>f.basename);
			}
		)
	}
});


const sort_file_explorer = (plugin:NoteChainPlugin) => ({
	id: "sort_file_explorer",
    name: "Sort File Explorer by Note Chain.",
	callback: () => {
		plugin.chain.dbchain.indexOf();
		plugin.explorer.file_explorer.sort();
	}
});


const suggester_reveal_folder = (plugin:NoteChainPlugin) => ({
    id: "reveal_folder",
    name: "Reveal Folder",
    callback: () => {
		let folders = plugin.chain.get_all_folders();
		let folder = plugin.chain.suggester(
			(f:TFolder)=>f.path,
			folders,
			false,
			'Choose folder to reveal.'
		).then(
			(folder:TFolder)=>{
				plugin.app.internalPlugins.plugins["file-explorer"].instance.revealInFolder(folder);
			}
		)
    },
});


const commandBuilders = [
	longform2notechain,
	longform4notechain,
	sort_file_explorer
	// suggester_reveal_folder,
];

function addCommands(plugin:NoteChainPlugin) {
    commandBuilders.forEach((c) => {
        plugin.addCommand(c(plugin));
    });
}

export default class NoteChainPlugin extends Plugin {
	settings: NCSettings;
	chain : NoteChain;
	editor : NCEditor; 
	explorer : NCFileExplorer;

	async onload() {
		await this.loadSettings();

		this.editor = new NCEditor(this.app);
		this.chain = new NoteChain(this);
		this.explorer = new NCFileExplorer(this);

		addCommands(this);

		this.addCommand({
			id: 'chain_insert_node',
			name: 'Insert node of chain',
			callback: async () => {
				await this.chain_insert_node();
				await this.editor.sleep(300);
				this.explorer.file_explorer.sort();
			}
		});
		
		this.addCommand({
			id: 'chain_set_seq_note',
			name: 'Reset the chain of current folder! Warning: It will reset your chain',
			callback: () => {
				this.chain.chain_suggester_tfiles().then(
					()=>{this.explorer.file_explorer.sort();}
				);
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
		this.addSettingTab(new NCSettingTab(this.app, this));

		console.log('Zig-Holding:regeister ufunc_on_file_open');
		this.registerEvent(
			this.app.workspace.on('file-open', this.ufunc_on_file_open)
		);

		this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
			menu.addItem((item) => {
				item
					.setTitle("NoteChain: sort by chain")
					.onClick(() => {
						this.chain.dbchain.init_chains();
						this.chain.view_sort_by_chain();
				});
			});
		}));

		this.registerEvent(this.app.vault.on(
			"delete", (file: TFile) => {
				this.chain.chain_pop_node(file);
				this.chain.dbchain.init_chains();
				this.explorer.file_explorer.sort();
			}
		))

		this.registerEvent(this.app.vault.on(
			"create", () => {
				console.log('create');
				this.chain.dbchain.init_chains();
				this.explorer.file_explorer.sort();
			}
		))

		this.registerEvent(this.app.vault.on(
			"rename", (file: TFile,oldPath:string) => {
				console.log(file,oldPath);
				this.chain.dbchain.init_chains();
				this.explorer.file_explorer.sort();
			}
		))
	}


	onunload() {
		console.log('Zig-Holding:unregeister ufunc_on_file_open');
		this.app.workspace.off('file-open', this.ufunc_on_file_open);
		this.explorer.unregister();
		this.explorer.file_explorer.sort();
		
	}

	async ufunc_on_file_open(file){
		let zh = await app.plugins.getPlugin("note-chain");
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
		if(curr==null){return;}
		let notes = await this.chain.suggester_notes(curr,false);
		if(!notes){return}
		notes = this.chain.sort_tfiles(notes,['mtime','x']);
		notes = this.chain.sort_tfiles_by_chain(notes);
		//notes = notes.filter(f=>f!=curr);

		const note = await this.chain.suggester(
			(file) => this.tfile_to_string(file,[],""), 
			notes
		); 
		
		if(!note){return;}
		
		let sitems = [
			"insert_node_after",
			"insert_node_before",
			"insert_node_as_head",
			"insert_node_as_tail",
			"insert_folder_after",
		];
		let mode = await this.chain.suggester(
			sitems,sitems,false,"Select Node Insert Mode."
		);
		
		if(!mode){return;}

		console.log(typeof(mode),mode);

		if(mode==='insert_node_as_head'){
			await this.chain.chain_insert_node_as_head(curr,note);
		}else if(mode==='insert_node_as_tail'){
			await this.chain.chain_insert_node_as_tail(curr,note);
		}else if(mode==='insert_node_before'){
			await this.chain.chain_insert_node_before(curr,note);
		}else if(mode==='insert_node_after'){
			await this.chain.chain_insert_node_after(curr,note);
		}else if(mode==='insert_folder_after'){
			await this.chain.chain_insert_folder_after(curr,note);
		}else{
			return;
		}

	}
	
	tfile_to_string(tfile,fields,seq){
		let meta = this.app.metadataCache.getFileCache(tfile);
		let items = new Array();
		if(tfile==this.chain.current_note){
			items.push('🏠' + tfile.basename)
		}else{
			items.push(tfile.basename)
		}
		
		for(let field of fields){
			try{
				items.push(meta.frontmatter[field]);
			}catch(error){
				items.push("-");
			}
		}
		return items.join(seq);
	}

	open_note_smarter(){
		// 链式调用
		let curr = this.chain.current_note;
		return this.chain.suggester_notes(curr,false).then((notes)=>{
			notes = this.chain.sort_tfiles(notes,['mtime','x']);
			notes = this.chain.sort_tfiles_by_chain(notes);
			return this.chain.suggester(
				(file) => this.chain.tfile_to_string(file), 
				notes
			).then((note)=>{
				return this.chain.open_note(note);
			})
		});
	}

}

class NCSettingTab extends PluginSettingTab {
	plugin: NoteChainPlugin;

	constructor(app: App, plugin: NoteChainPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
				.setName('Sort File Explorer')
				.setDesc('Sort File Explorer by Chain')
				.addToggle(text => text
					.setValue(this.plugin.settings.isSortFileExplorer)
					.onChange(async (value) => {
						this.plugin.settings.isSortFileExplorer = value;
						await this.plugin.saveSettings();
						this.plugin.explorer.file_explorer.sort();
					})
				);
		new Setting(containerEl)
				.setName('Sort Folder First')
				.setDesc('Sort File Explorer Folder First')
				.addToggle(text => text
					.setValue(this.plugin.settings.isFolderFirst)
					.onChange(async (value) => {
						this.plugin.settings.isFolderFirst = value;
						await this.plugin.saveSettings();
						this.plugin.explorer.file_explorer.sort();
					})
				);

		
		new Setting(containerEl)
			.setName('PrevChain')
			.setDesc('Number of Prev Notes to show?')
			.addText(text => text
				.setValue(this.plugin.settings.PrevChain)
				.onChange(async (value) => {
					this.plugin.settings.PrevChain = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('NextChain')
			.setDesc('Number of Next Notes to show?')
			.addText(text => text
				.setValue(this.plugin.settings.NextChain)
				.onChange(async (value) => {
					this.plugin.settings.NextChain = value;
					await this.plugin.saveSettings();
				}));

		
		new Setting(containerEl)  
				.setName('refreshDataView')
				.setDesc('Refresh Dataview while open new file?')
				.addToggle(text => text
					.setValue(this.plugin.settings.refreshDataView)
					.onChange(async (value) => {
						this.plugin.settings.refreshDataView = value;
						await this.plugin.saveSettings();
					})
				);
		new Setting(containerEl)
				.setName('refreshTasks')
				.setDesc('Refresh Tasks while open new file?')
				.addToggle(text => text
					.setValue(this.plugin.settings.refreshTasks)
					.onChange(async (value) => {
						this.plugin.settings.refreshTasks = value;
						await this.plugin.saveSettings();
					})
				);
	}
}
