import { 
	App, Editor, MarkdownView, Modal, Notice, 
	Plugin, PluginSettingTab, Setting,
	TFile,TFolder
} from 'obsidian';


import {NCEditor} from './src/NCEditor';
import {NoteChain} from './src/NoteChain';
import {NCFileExplorer} from './src/NCFileExplorer';
import { LangString } from 'src/lang';

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

const cmd_longform2notechain = (plugin:NoteChainPlugin) => ({
	id: "longform2notechain",
    name: plugin.lang.cmd_longform2notechain,
	callback: () => {
		let curr = plugin.chain.current_note;
		if(curr == null){return;}
		app.fileManager.processFrontMatter(
			curr,
			fm =>{
				if(curr==null){return;}
				if(fm['longform']==null){return;}
				let scenes = plugin.utils.concat_array(fm.longform.scenes);
				let ignoredFiles = plugin.utils.concat_array(fm.longform.ignoredFiles);
				ignoredFiles = ignoredFiles.filter((f:string)=>!scenes.contains(f));
				let notes = plugin.utils.concat_array([scenes,ignoredFiles]);
				notes = notes.map((f:string)=>plugin.chain.tp_find_tfile(f));
				if(curr.parent==null){return};
				let tfiles = plugin.chain.get_tfiles_of_folder(curr.parent).filter((f:any)=>!notes.contains(f));
				notes = plugin.utils.concat_array([tfiles,notes]);
				plugin.chain.chain_concat_tfiles(notes);
			}
		)
	}
});

const cmd_longform4notechain = (plugin:NoteChainPlugin) => ({
	id: "longform4notechain",
    name: plugin.lang.cmd_longform4notechain,
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


const cmd_sort_file_explorer = (plugin:NoteChainPlugin) => ({
	id: "sort_file_explorer",
    name: plugin.lang.cmd_sort_file_explorer,
	callback: async () => {
		await plugin.explorer.sort();
	}
});

const cmd_open_notes_smarter = (plugin:NoteChainPlugin) => ({
	id: 'open_notes_smarter',
	name: plugin.lang.cmd_open_notes_smarter,
	callback: () => {
		plugin.open_note_smarter();
	}
})

const cmd_open_note = (plugin:NoteChainPlugin) => ({
	id: 'sugguster_open_note',
	name: plugin.lang.cmd_open_note,
	callback: () => {
		plugin.chain.sugguster_open_note();
	}
});

const cmd_open_prev_notes = (plugin:NoteChainPlugin) => ({
	id: 'open_prev_notes',
	name: plugin.lang.cmd_open_prev_notes,
	callback: () => {
		plugin.chain.open_prev_notes();
	}
});

const cmd_open_next_notes = (plugin:NoteChainPlugin) => ({
	id: 'open_next_notes',
	name: plugin.lang.cmd_open_next_notes,
	callback: () => {
		plugin.chain.open_next_notes();
	}
});


const clear_inlinks = (plugin:NoteChainPlugin) => ({
	id: 'clear_inlinks',
	name: plugin.lang.clear_inlinks,
	callback: () => {
		plugin.clear_inlinks();
	}
});

const move_file_to_another_folder = (plugin:NoteChainPlugin) => ({
	id: 'move_file_to_another_folder',
	name: plugin.lang.move_file_to_another_folder,
	callback: () => {
		plugin.chain.cmd_move_file_to_another_folder();
	}
});

const replace_notes_with_regx = (plugin:NoteChainPlugin) => ({
	id: 'replace_notes_with_regx',
	name: plugin.lang.replace_notes_with_regx,
	callback: () => {
		plugin.replace_notes_with_regx();
	}
});

const chain_insert_node = (plugin:NoteChainPlugin) => ({
	id: 'chain_insert_node',
	name: plugin.lang.chain_insert_node,
	callback: async () => {
		await plugin.cmd_chain_insert_node();
		await plugin.explorer.sort(500);
	}
});

const chain_set_seq_note = (plugin:NoteChainPlugin) => ({
	id: 'chain_set_seq_note',
	name: plugin.lang.chain_set_seq_note,
	callback: async () => {
		await plugin.chain.chain_suggester_tfiles();
		plugin.explorer.sort();
	}
});

const create_new_note = (plugin:NoteChainPlugin) => ({
	id: 'create_new_note',
	name: plugin.lang.create_new_note,
	callback: async () => {
		let targets = {
			'添加后置笔记' :'chain_insert_node_after',
			'链尾添加笔记' : 'chain_insert_node_as_tail',
			'添加前置笔记' : 'chain_insert_node_before',
			'链头添加笔记' : 'chain_insert_node_as_head',
			'无链接' : `null`,
		}
		let target = await plugin.chain.tp_suggester(
			plugin.utils.array_prefix_id(Object.keys(targets)), 
			Object.values(targets), 
			true, 
			'选择笔记类型.'
		);
		if(!target){return;}
		let name = await plugin.chain.tp_prompt('请输入文件名');
		if(name){
			let curr = plugin.chain.current_note;
			if(curr && curr.parent){
				let path = curr.parent.path+'/'+name+'.md';
				let dst = await plugin.chain.get_tfile(path);
				if(dst==null){
					let func = plugin.utils.get_tp_func(plugin.app,'tp.file.create_new')
					dst = await func(
						'',name,
						false,curr.parent
					);
					await plugin.utils.sleep(300);
					if(!(target==='null')){
						await (plugin.chain as any)[target](dst,curr);
					}
					await plugin.utils.sleep(300);
					await plugin.chain.open_note(dst);
					await plugin.explorer.sort();
				}
			}	
		}
	}
});

const commandBuilders = [
	cmd_open_prev_notes,
	cmd_open_next_notes,
	cmd_open_notes_smarter,
	cmd_open_note,
	cmd_longform2notechain,
	cmd_longform4notechain,
	cmd_sort_file_explorer,
	clear_inlinks,
	replace_notes_with_regx,
	move_file_to_another_folder,
	chain_insert_node,
	chain_set_seq_note,
	create_new_note
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
	lang : LangString;
	debug:boolean;
	utils:any;
	ob:any;

	async onload() {
		this.debug=true;
		await this.loadSettings();
		
		this.utils = require('./src/utils');
		this.ob = require('obsidian');
		
		this.editor = new NCEditor(this.app);
		this.chain = new NoteChain(this,this.editor);
		this.explorer = new NCFileExplorer(this);
		this.lang = new LangString();

		addCommands(this);

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new NCSettingTab(this.app, this));

		console.log('Zig-Holding:regeister ufunc_on_file_open');
		this.registerEvent(
			this.app.workspace.on('file-open', this.ufunc_on_file_open)
		);

		this.registerEvent(this.app.vault.on(
			"delete", async (file: TFile) => {
				await this.chain.chain_pop_node(file);
				await this.explorer.sort();
			}
		))

		this.registerEvent(this.app.vault.on(
			"create", async () => {
				await this.utils.sleep(500);
				this.explorer.sort();
			}
		))

		this.registerEvent(this.app.vault.on(
			"rename", async (file: TFile,oldPath:string) => {
				await this.utils.sleep(500);
				this.explorer.sort();
			}
		))
	}


	onunload() {
		console.log('Zig-Holding:unregeister ufunc_on_file_open');
		this.app.workspace.off('file-open', this.ufunc_on_file_open);
		this.explorer.unregister();
		this.explorer.sort();
	}


	console_log(...d:any){
		if(this.debug){
			console.log(...d);
		}
	}

	async ufunc_on_file_open(file:TFile){
		let zh = await (app as any).plugins.getPlugin("note-chain");
		if(!zh){return;}
		if(zh.settings.refreshDataView){
			zh.app.commands.executeCommandById(
				"dataview:dataview-force-refresh-views"
			)
		}
		if(zh.settings.refreshTasks){
			let target = await (app as any).plugins.getPlugin("obsidian-tasks-plugin");
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
		if(tfile==null){return;}
		let notes = this.chain.get_inlinks(tfile);
		if(notes.length){
			if(mode==='suggester'){
				mode = await this.chain.tp_suggester(
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

	async replace_notes_with_regx(){
		let notes = await this.chain.suggester_notes();
		if(notes?.length>0){
			try {
				let regs = await this.chain.tp_prompt('要替换的正则表达式');
				if(regs==null){
					return;
				}
				let reg = new RegExp(regs,'g');
				
				let target = await this.chain.tp_prompt('目标字符串');
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
	
	async cmd_chain_insert_node(){
		let curr = this.chain.current_note;
		if(curr==null){return;}
		let notes = await this.chain.suggester_notes(curr,false);
		if(!notes){return}
		notes = this.chain.sort_tfiles(notes,['mtime','x']);
		notes = this.chain.sort_tfiles_by_chain(notes);
		//notes = notes.filter(f=>f!=curr);
		if(notes.length==0){return;}
		const note = await this.chain.tp_suggester(
			(file:TFile) => this.tfile_to_string(file,[],""), 
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
		let mode = await this.chain.tp_suggester(
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
	
	tfile_to_string(tfile:TFile,fields:Array<string>,seq:string){
		let items = new Array();
		if(tfile==this.chain.current_note){
			items.push('🏠' + tfile.basename)
		}else{
			items.push(tfile.basename)
		}
		
		for(let field of fields){
			try{
				items.push(this.editor.get_frontmatter(tfile,field));
			}catch(error){
				items.push("-");
			}
		}
		return items.join(seq);
	}

	async open_note_smarter(){
		// 链式调用
		let curr = this.chain.current_note;
		let notes = await this.chain.suggester_notes(curr,false)
		
		notes = this.chain.sort_tfiles(notes,['mtime','x']);
		notes = this.chain.sort_tfiles_by_chain(notes);
		if(notes.length>0){
			let note = await this.chain.tp_suggester(
				(file:TFile) => this.chain.tfile_to_string(file), 
				notes
			)
			if(note){
				await this.chain.open_note(note);
			}
		}
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
				.setName(this.plugin.lang.setting_isSortFileExplorer)
				.addToggle(text => text
					.setValue(this.plugin.settings.isSortFileExplorer)
					.onChange(async (value) => {
						this.plugin.settings.isSortFileExplorer = value;
						await this.plugin.saveSettings();
						this.plugin.explorer.sort();
					})
				);
		new Setting(containerEl)
				.setName(this.plugin.lang.setting_isFolderFirst)
				.addToggle(text => text
					.setValue(this.plugin.settings.isFolderFirst)
					.onChange(async (value) => {
						this.plugin.settings.isFolderFirst = value;
						await this.plugin.saveSettings();
						this.plugin.explorer.sort();
					})
				);

		
		new Setting(containerEl)
			.setName('Number of Prev Notes to show?')
			.addText(text => text
				.setValue(this.plugin.settings.PrevChain)
				.onChange(async (value) => {
					this.plugin.settings.PrevChain = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(this.plugin.lang.setting_NextChain)
			.addText(text => text
				.setValue(this.plugin.settings.NextChain)
				.onChange(async (value) => {
					this.plugin.settings.NextChain = value;
					await this.plugin.saveSettings();
				}));

		
		new Setting(containerEl)  
				.setName(this.plugin.lang.setting_refreshDataView)
				.addToggle(text => text
					.setValue(this.plugin.settings.refreshDataView)
					.onChange(async (value) => {
						this.plugin.settings.refreshDataView = value;
						await this.plugin.saveSettings();
					})
				);
		new Setting(containerEl)
				.setName(this.plugin.lang.setting_refreshTasks)
				.addToggle(text => text
					.setValue(this.plugin.settings.refreshTasks)
					.onChange(async (value) => {
						this.plugin.settings.refreshTasks = value;
						await this.plugin.saveSettings();
					})
				);
	}
}
