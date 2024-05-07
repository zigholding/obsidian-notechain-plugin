import { 
	App, Editor, MarkdownView, Modal, Notice, 
	Plugin, PluginSettingTab, Setting,
	TFile,TFolder
} from 'obsidian';


import {NCEditor} from './src/NCEditor';
import {NoteChain} from './src/NoteChain';
import {NCFileExplorer} from './src/NCFileExplorer';
import { Strings } from 'src/strings';

// Remember to rename these classes and interfaces!

interface NCSettings {
	PrevChain:string;
	NextChain:string;
	refreshDataView:boolean;
	refreshTasks:boolean,
	isSortFileExplorer:boolean,
	isFolderFirst:boolean,
	suggesterNotesMode:string,
}

const DEFAULT_SETTINGS: NCSettings = {
	PrevChain : "10",
	NextChain : "10",
	refreshDataView : true,
	refreshTasks : true,
	isSortFileExplorer : true,
	isFolderFirst : true,
	suggesterNotesMode:''
}

const cmd_longform2notechain = (plugin:NoteChainPlugin) => ({
	id: "longform2notechain",
    name: plugin.strings.cmd_longform2notechain,
	callback: async () => {
		let curr = plugin.chain.current_note;
		if(curr == null){return;}
		plugin.app.fileManager.processFrontMatter(
			curr,
			async (fm) =>{
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
				await plugin.chain.chain_concat_tfiles(notes);
				plugin.explorer.sort();
			}
		)
	}
});

const cmd_longform4notechain = (plugin:NoteChainPlugin) => ({
	id: "longform4notechain",
    name: plugin.strings.cmd_longform4notechain,
	callback: () => {
		let curr = plugin.chain.current_note;
		if(curr==null){return;}
		plugin.app.fileManager.processFrontMatter(
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
    name: plugin.strings.cmd_sort_file_explorer,
	callback: async () => {
		await plugin.explorer.sort();
	}
});

const cmd_open_notes_smarter = (plugin:NoteChainPlugin) => ({
	id: 'open_notes_smarter',
	name: plugin.strings.cmd_open_notes_smarter,
	callback: () => {
		plugin.open_note_smarter();
	}
})

const cmd_open_note = (plugin:NoteChainPlugin) => ({
	id: 'suggestor_open_note',
	name: plugin.strings.cmd_open_note,
	callback: () => {
		plugin.chain.sugguster_open_note();
	}
});

const cmd_open_prev_notes = (plugin:NoteChainPlugin) => ({
	id: 'open_prev_notes',
	name: plugin.strings.cmd_open_prev_notes,
	callback: () => {
		plugin.chain.open_prev_notes();
	}
});

const cmd_open_next_notes = (plugin:NoteChainPlugin) => ({
	id: 'open_next_notes',
	name: plugin.strings.cmd_open_next_notes,
	callback: () => {
		plugin.chain.open_next_notes();
	}
});


const clear_inlinks = (plugin:NoteChainPlugin) => ({
	id: 'clear_inlinks',
	name: plugin.strings.clear_inlinks,
	callback: () => {
		plugin.clear_inlinks();
	}
});

const move_file_to_another_folder = (plugin:NoteChainPlugin) => ({
	id: 'move_file_to_another_folder',
	name: plugin.strings.move_file_to_another_folder,
	callback: () => {
		plugin.chain.cmd_move_file_to_another_folder();
	}
});

const replace_notes_with_regx = (plugin:NoteChainPlugin) => ({
	id: 'replace_notes_with_regx',
	name: plugin.strings.replace_notes_with_regx,
	callback: () => {
		plugin.replace_notes_with_regx();
	}
});

const chain_insert_node = (plugin:NoteChainPlugin) => ({
	id: 'chain_insert_node',
	name: plugin.strings.chain_insert_node,
	callback: async () => {
		await plugin.cmd_chain_insert_node();
		await plugin.explorer.sort(500);
	}
});

const chain_set_seq_note = (plugin:NoteChainPlugin) => ({
	id: 'chain_set_seq_note',
	name: plugin.strings.chain_set_seq_note,
	callback: async () => {
		await plugin.chain.chain_suggester_tfiles();
		plugin.explorer.sort();
	}
});

const chain_move_up_node = (plugin:NoteChainPlugin) => ({
	id: 'chain_move_up_node',
	name: plugin.strings.chain_move_up_node,
	callback: async () => {
		let tfile = plugin.chain.current_note;
		if(tfile){
			let anchor = plugin.chain.get_prev_note(tfile);
			if(anchor){
				await plugin.chain.chain_insert_node_before(
					tfile,anchor
				);
				await plugin.explorer.sort();
			}
		}
	}
});

const chain_move_down_node = (plugin:NoteChainPlugin) => ({
	id: 'chain_move_donw_node',
	name: plugin.strings.chain_move_down_node,
	callback: async () => {
		let tfile = plugin.chain.current_note;
		if(tfile){
			let anchor = plugin.chain.get_next_note(tfile);
			if(anchor){
				await plugin.chain.chain_insert_node_after(
					tfile,anchor
				);
				await plugin.explorer.sort();
			}
		}
	}
});

const create_new_note = (plugin:NoteChainPlugin) => ({
	id: 'create_new_note',
	name: plugin.strings.create_new_note,
	callback: async () => {
		let targets :{[key:string]:string} = {}
		targets[plugin.strings.item_chain_insert_node_after] = 'chain_insert_node_after';
		targets[plugin.strings.item_chain_insert_node_as_tail] = 'chain_insert_node_as_tail';
		targets[plugin.strings.item_chain_insert_node_before] = 'chain_insert_node_before';
		targets[plugin.strings.item_chain_insert_node_as_head] = 'chain_insert_node_as_head';
		targets[plugin.strings.item_item_chain_insert_null] = 'null';

		let target = await plugin.chain.tp_suggester(
			plugin.utils.array_prefix_id(Object.keys(targets)), 
			Object.values(targets), 
			true
		);
		if(!target){return;}
		let name = await plugin.chain.tp_prompt(plugin.strings.prompt_notename);
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
					await sleep(300);
					if(!(target==='null')){
						await (plugin.chain as any)[target](dst,curr);
					}
					await sleep(300);
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
	create_new_note,
	chain_move_up_node,
	chain_move_down_node
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
	strings : Strings;
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
		this.strings = new Strings();

		addCommands(this);

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new NCSettingTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on('file-open', this.ufunc_on_file_open.bind(this))
		);

		this.registerEvent(this.app.vault.on(
			"delete", async (file: TFile) => {
				await this.chain.chain_pop_node(file);
				await this.explorer.sort();
			}
		))

		this.registerEvent(this.app.vault.on(
			"create", async () => {
				await sleep(500);
				this.explorer.sort();
			}
		))

		this.registerEvent(this.app.vault.on(
			"rename", async (file: TFile,oldPath:string) => {
				await sleep(500);
				this.explorer.sort();
			}
		))
	}


	onunload() {
		this.explorer.unregister();
		this.explorer.sort();
	}
	
	async ufunc_on_file_open(file:TFile){
		if(this.settings.refreshDataView){
			(this.app as any).commands.executeCommandById(
				"dataview:dataview-force-refresh-views"
			)
		}
		if(this.settings.refreshTasks){
			let target = await (this.app as any).plugins.getPlugin("obsidian-tasks-plugin");
			target && target.cache.notifySubscribers();
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
					["delete links",'replace links',"delete paragraph with links",],
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
				let regs = await this.chain.tp_prompt('Enter the regular expression to replace.');
				if(regs==null){
					return;
				}
				let reg = new RegExp(regs,'g');
				
				let target = await this.chain.tp_prompt('Enter the target string.');
				if(target==null){
					return;
				}
				target = target.trim().replace(
					/\\n/g,'\n'
				);
				for(let note of notes){
					await this.editor.replace(note,reg,target);
				}
			} catch (error) {
				
			}
			
		}
	}
	
	async cmd_chain_insert_node(){
		let curr = this.chain.current_note;
		if(curr==null){return;}
		let smode = (this.strings as any)[this.settings.suggesterNotesMode];
		let notes = await this.chain.suggester_notes(curr,false,smode);
		if(!notes){return}
		notes = this.chain.sort_tfiles(notes,['mtime','x']);
		notes = this.chain.sort_tfiles_by_chain(notes);
		//notes = notes.filter(f=>f!=curr);
		//为0时也显示，否则以为是bug
		//if(notes.length==0){return;}
		const note = await this.chain.tp_suggester(
			(file:TFile) => this.tfile_to_string(file,[],""), 
			notes
		); 
		
		if(!note){return;}
		
		let sitems = [
			this.strings.item_insert_node_after,
			this.strings.item_insert_node_before,
			this.strings.item_insert_node_as_head,
			this.strings.item_insert_node_as_tail,
			this.strings.item_insert_folder_after,
		];
		let mode = await this.chain.tp_suggester(
			this.utils.array_prefix_id(sitems),
			sitems,false,this.strings.item_insert_suggester
		);
		
		if(!mode){return;}

		if(mode===this.strings.item_insert_node_as_head){
			await this.chain.chain_insert_node_as_head(curr,note);
		}else if(mode===this.strings.item_insert_node_as_tail){
			await this.chain.chain_insert_node_as_tail(curr,note);
		}else if(mode===this.strings.item_insert_node_before){
			await this.chain.chain_insert_node_before(curr,note);
		}else if(mode===this.strings.item_insert_node_after){
			await this.chain.chain_insert_node_after(curr,note);
		}else if(mode===this.strings.item_insert_folder_after){
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
				.setName(this.plugin.strings.setting_isSortFileExplorer)
				.addToggle(text => text
					.setValue(this.plugin.settings.isSortFileExplorer)
					.onChange(async (value) => {
						this.plugin.settings.isSortFileExplorer = value;
						await this.plugin.saveSettings();
						this.plugin.explorer.sort();
					})
				);
		new Setting(containerEl)
				.setName(this.plugin.strings.setting_isFolderFirst)
				.addToggle(text => text
					.setValue(this.plugin.settings.isFolderFirst)
					.onChange(async (value) => {
						this.plugin.settings.isFolderFirst = value;
						await this.plugin.saveSettings();
						this.plugin.explorer.sort();
					})
				);

		
		new Setting(containerEl)
			.setName(this.plugin.strings.setting_PrevChain)
			.addText(text => text
				.setValue(this.plugin.settings.PrevChain)
				.onChange(async (value) => {
					this.plugin.settings.PrevChain = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(this.plugin.strings.setting_suggesterNotesMode)
			.addDropdown(dropdown => dropdown
				.addOption('item_get_brothers',this.plugin.strings.item_get_brothers)
				.addOption('item_uncle_notes',this.plugin.strings.item_uncle_notes)
				.addOption('item_notechain',this.plugin.strings.item_notechain)
				.addOption('item_same_folder',this.plugin.strings.item_same_folder)
				.addOption('item_inlinks_outlinks',this.plugin.strings.item_inlinks_outlinks)
				.addOption('item_inlins',this.plugin.strings.item_inlins)
				.addOption('item_outlinks',this.plugin.strings.item_outlinks)
				.addOption('item_all_noes',this.plugin.strings.item_all_noes)
				.addOption('item_recent',this.plugin.strings.item_recent)
				.addOption('','')

				.setValue(this.plugin.settings.suggesterNotesMode)
				.onChange(async (value) => {
					this.plugin.settings.suggesterNotesMode = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(this.plugin.strings.setting_NextChain)
			.addText(text => text
				.setValue(this.plugin.settings.NextChain)
				.onChange(async (value) => {
					this.plugin.settings.NextChain = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)  
				.setName(this.plugin.strings.setting_refreshDataView)
				.addToggle(text => text
					.setValue(this.plugin.settings.refreshDataView)
					.onChange(async (value) => {
						this.plugin.settings.refreshDataView = value;
						await this.plugin.saveSettings();
					})
				);
				
		new Setting(containerEl)
				.setName(this.plugin.strings.setting_refreshTasks)
				.addToggle(text => text
					.setValue(this.plugin.settings.refreshTasks)
					.onChange(async (value) => {
						this.plugin.settings.refreshTasks = value;
						await this.plugin.saveSettings();
					})
				);
	}
}
