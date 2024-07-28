import { 
	App, Editor, MarkdownView, Modal, Notice, 
	CachedMetadata,
	Plugin,
	TAbstractFile,
	TFile,TFolder
} from 'obsidian';

import {NCEditor} from './src/NCEditor';
import {NoteChain} from './src/NoteChain';
import {NCFileExplorer} from './src/NCFileExplorer';
import { Strings } from 'src/strings';
import { WordCount } from 'src/WordCount';
import { NCSettingTab,NCSettings,DEFAULT_SETTINGS } from 'src/setting';
import { addCommands } from 'src/commands';


export default class NoteChainPlugin extends Plugin {
	settings: NCSettings;
	chain : NoteChain;
	editor : NCEditor; 
	explorer : NCFileExplorer;
	wordcout : WordCount;
	strings : Strings;
	debug:boolean;
	utils:any;
	timerId:any;
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
		));

		this.registerEvent(this.app.vault.on(
			"create", async () => {
				await sleep(500);
				this.explorer.sort(0,true);
			}
		));

		this.registerEvent(this.app.vault.on(
			"rename", async (file: TFile,oldPath:string) => {
				let oldFolder = this.app.vault.getFolderByPath(
					oldPath.slice(0,oldPath.lastIndexOf('/'))
				)
				oldFolder && this.chain.refresh_folder(oldFolder);
				this.chain.refresh_tfile(file);
				this.explorer.sort();
			}
		));

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if(file instanceof TFile){
					menu.addItem((item) => {
						item
						.setTitle("Create next note")
						.setIcon("file-plus")
						.onClick(async () => {
							let filename = await this.chain.tp_prompt('File name');
							let dst = file.parent?file.parent.path + '/' + filename+'.md':filename+'.md';
							if(this.chain.get_tfile(dst)){
								new Notice('Exists:'+file.path,3000);
							}else{
								let tfile = await this.app.vault.create(dst,'');
								await this.chain.chain_insert_node_after(tfile,file);
								await this.chain.open_note(tfile,false,false);
							}
						});
					});
				}
			})
		);

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if(file instanceof TFile && file.extension=='md'){
					menu.addItem((item) => {
						item
						.setTitle("Move as next note")
						.setIcon("hand")
						.onClick(async () => {
							let anchor = await this.chain.sugguster_note();
							await this.chain.chain_insert_node_after(file,anchor);
							if(file.parent!=anchor.parent){
								let dst = anchor.parent.path+'/'+file.name;
								await this.app.fileManager.renameFile(file,dst);
							}
							this.explorer.sort();
						});
					});
				}else if(file instanceof TFolder){
					menu.addItem((item) => {
						item
						.setTitle("Move as next note")
						.setIcon("hand")
						.onClick(async () => {
							let notes = file.parent?.children;
							if(notes){
								let anchor = await this.chain.tp_suggester(
									(f:TAbstractFile)=>f.name,
									notes.filter((x:TAbstractFile)=>x instanceof TFile)
								)

								let note = this.chain.get_tfile(file.path+'/'+file.name+'.md');
								if(!note){
									note = await this.app.vault.create(
										file.path+'/'+file.name+'.md',''
									);
								}
								await this.editor.set_multi_frontmatter(
									note,
									{
										"FolderPrevNote":`[[${anchor.basename}]]`,
										"FolderPrevNoteOffset":0.5,
									}
								)
								this.chain.refresh_tfile(file);
								await this.explorer.sort(0,false);
							}
						});
					});
				}
			})
		);
		
		this.registerEvent(
			this.app.metadataCache.on(
				'changed',(file: TFile, data: string, cache: CachedMetadata)=>{
					clearTimeout(this.timerId);
					this.timerId = setTimeout(()=>{
						if(file.parent){
							this.chain.children[file.parent.path]= this.chain.sort_tfiles_by_chain(
								file.parent.children
							);
						}
						this.explorer.sort(0,false);
					},500)
			})
		);
		this.wordcout = new WordCount(this,this.app);
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