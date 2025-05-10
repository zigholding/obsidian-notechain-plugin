import { 
	App, Editor, MarkdownView, Modal, Notice, 
	CachedMetadata,
	Plugin,
	TAbstractFile,
	moment,
	TFile,TFolder
} from 'obsidian';

import {NCEditor} from './src/NCEditor';
import {NoteChain} from './src/NoteChain';
import {NCTextarea} from './src/NCTextarea';
import {NCFileExplorer} from './src/NCFileExplorer';
import { Strings } from 'src/strings';
import { WordCount } from 'src/WordCount';
import { MermaidGraph,CanvasGraph } from 'src/graph';
import { NCSettingTab,NCSettings,DEFAULT_SETTINGS } from 'src/setting';
import { addCommands } from 'src/commands';
import {dialog_suggest} from 'src/gui/inputSuggester'
import {dialog_prompt} from 'src/gui/inputPrompt'


export default class NoteChainPlugin extends Plugin {
	settings: NCSettings;
	chain : NoteChain;
	textarea : NCTextarea;
	editor : NCEditor; 
	explorer : NCFileExplorer;
	mermaid : MermaidGraph;
	canvas : CanvasGraph;
	wordcout : WordCount;
	strings : Strings;
	status : string;
	debug:boolean;
	utils:any;
	timerId:any;
	ob:any;
	dialog_suggest: Function
	dialog_prompt: Function


	async onload() {
		this.dialog_suggest = dialog_suggest
		this.dialog_prompt = dialog_prompt
		this.status = 'waiting'
		this.app.workspace.onLayoutReady(
			async()=>{
				await this._onload_();
				this._after_loading_()
			}
		)
	}

	async _after_loading_() {
		while (!(this.app as any).plugins?.plugins['note-chain']) {
			await new Promise(resolve => setTimeout(resolve, 100)); // 等待100ms再检查
		}

		(this.app as any).commands.executeCommandById(
			"dataview:dataview-force-refresh-views"
		);

		let target = await (this.app as any).plugins.getPlugin("obsidian-tasks-plugin");
		target && target.cache.notifySubscribers();

		// new Notice('Note Chain is ready!',3000)
		return (this.app as any).plugins?.plugins['note-chain']
	}

	async _onload_() {
		this.status = 'loading'
		this.debug=true;
		await this.loadSettings();
		
		this.utils = require('./src/utils');
		this.ob = require('obsidian');
		
		this.editor = new NCEditor(this);
		this.chain = new NoteChain(this,this.editor);
		this.explorer = new NCFileExplorer(this);
		this.mermaid = new MermaidGraph(this);
		this.canvas = new CanvasGraph(this);
		this.strings = new Strings();

		addCommands(this);

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new NCSettingTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on('file-open', this.ufunc_on_file_open.bind(this))
		);

		// 删除文件
		this.registerEvent(this.app.vault.on(
			"delete", async (file: TFile) => {
				await this.chain.chain_pop_node(file);
				await this.explorer.sort();
			}
		));

		// 创建文件
		this.registerEvent(this.app.vault.on(
			"create", async () => {
				await sleep(500);
				this.explorer.sort(0,true);
			}
		));

		// 重命名文件
		this.registerEvent(this.app.vault.on(
			"rename", async (file: TFile,oldPath:string) => {
				let oldFolder = this.app.vault.getFolderByPath(
					oldPath.slice(0,oldPath.lastIndexOf('/'))
				)
				oldFolder && this.chain.refresh_folder(oldFolder);
				this.chain.refresh_tfile(file);
				this.explorer.sort();
				this.explorer.set_fileitem_style_of_file(file)
			}
		));

		// 创建后置文件
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if(file instanceof TFile){
					menu.addItem((item) => {
						item
						.setTitle(this.strings.filemenu_create_next_note)
						.setIcon("file-plus")
						.onClick(async () => {
							let filename = await this.dialog_prompt('File name');
							if(!filename){return}
							let dst = file.parent?file.parent.path + '/' + filename+'.md':filename+'.md';
							if(this.chain.get_tfile(dst)){
								new Notice('Exists:'+file.path,3000);
							}else{
								let tfile = await this.app.vault.create(dst,'');
								await this.chain.chain_insert_node_after(tfile,file);

								await this.editor.set_frontmatter_align_file(
									file,tfile,this.settings.field_of_confluence_tab_format
								)

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
						.setTitle(this.strings.filemenu_move_as_next_note)
						.setIcon("hand")
						.onClick(async () => {
							let anchor = await this.chain.sugguster_note();
							if(anchor){
								await this.chain.chain_insert_node_after(file,anchor);
								// 和前置笔记相同层级
								await this.editor.set_frontmatter_align_file(
									anchor,file,this.settings.field_of_confluence_tab_format
								)

								if(file.parent!=anchor.parent){
									let dst = anchor.parent.path+'/'+file.name;
									await this.app.fileManager.renameFile(file,dst);
								}
								this.explorer.sort();
							}
						});
					});
				}else if(file instanceof TFolder){
					menu.addItem((item) => {
						item
						.setTitle(this.strings.filemenu_move_as_next_note)
						.setIcon("hand")
						.onClick(async () => {
							let notes = file.parent?.children;
							if(notes){
								let anchor = await this.dialog_suggest(
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
				let selector = document.querySelectorAll(
					'.tree-item-self.is-selected'
				)
				let items = Object.values(selector).map((x:any)=>x.dataset?.path)
				let tfiles = items.map(x=>this.chain.get_tfile(x)).filter(x=>x.extension=='md')
				if(tfiles.length>1){
					menu.addItem((item) => {
						item
						.setTitle(this.strings.filemenu_move_as_next_notes)
						.setIcon("hand")
						.onClick(async () => {
							tfiles = this.chain.sort_tfiles_by_chain(tfiles)
							let notes = this.chain.get_all_tfiles()
							notes = notes.filter((x:TFile)=>!tfiles.contains(x))
							let anchor = await this.chain.sugguster_note(notes)
							if(!anchor){return}
							for(let tfile of tfiles){
								if(tfile.parent.path!=anchor.parent.path){
									let dst = anchor.parent.path+"/"+tfile.name;
									await this.app.fileManager.renameFile(tfile,dst);
								}
								await this.chain.chain_pop_node(tfile)
							}
							tfiles.unshift(anchor)
							let anchor_next = this.chain.get_next_note(anchor);
							if(anchor_next){tfiles.push(anchor_next)}
							await this.chain.chain_concat_tfiles(tfiles);
							for(let dst of tfiles.slice(1,tfiles.length-1)){
								await this.editor.set_frontmatter_align_file(
									anchor,dst,this.settings.field_of_confluence_tab_format
								)
							}
						});
					});
				}
			})
		);
		
		this.registerEvent(
			this.app.metadataCache.on(
				'changed',async (file: TFile, data: string, cache: CachedMetadata)=>{
					if(file==this.chain.current_note){
						clearTimeout(this.timerId);
					}
					let timerId = setTimeout(async ()=>{
						// 文件列表排序
						if(file.parent){
							this.chain.children[file.parent.path]= this.chain.sort_tfiles_by_chain(
								file.parent.children
							);
						}
						this.explorer.sort(0,false);

						// 文件名称
						if(this.settings.field_of_display_text){
							let txt = this.explorer.get_display_text(file)
							let items = (this.explorer.file_explorer as any).fileItems
							this.explorer._set_display_text_(items[file.path],txt)

							let canvas = items[file.path.slice(0,file.path.length-2)+'canvas']
							this.explorer._set_display_text_(canvas,txt)

							// 如果是目录
							if((file.parent && file.basename==file.parent.name) || (file.parent && file.parent.path=='/')){
								let field = this.editor.get_frontmatter(file,this.settings.field_of_display_text)
								let prev = (file as any).note_chain_display_field
								if(!prev || prev!=field){
									for(let key in items){
										let item = items[key]
										let ppath = ''
										if(file.parent.path=='/'){
											ppath == ''
										}else{
											ppath = file.parent.path+'/'
										}
										if(item.file.path.startsWith(ppath)||item.file.path==file.parent.path){
											let txt = this.explorer.get_display_text(item.file)
											this.explorer._set_display_text_(item,txt)
										}
									}
								}
								(file as any).note_chain_display_field = field
							}
						}

						// 文件颜色
						if(this.settings.field_of_background_color){
							let style = await this.explorer.get_fileitem_style(file)
							await this.explorer.set_fileitem_style_of_file(file,style)
							let items = (this.explorer.file_explorer as any).fileItems

							let canvas = items[file.path.slice(0,file.path.length-2)+'canvas']
							if(canvas){
								await this.explorer.set_fileitem_style_of_file(canvas.file,style)
							}

							// 如果是目录
							if((file.parent && file.basename==file.parent.name) || (file.parent && file.parent.path=='/')){
								let field = this.editor.get_frontmatter(file,this.settings.field_of_background_color)
								let prev = (file as any).note_chain_bgcolor
								if(!prev || prev!=field){
									for(let key in items){
										let item = items[key]
										let ppath = ''
										if(file.parent.path=='/'){
											ppath == ''
										}else{
											ppath = file.parent.path+'/'
										}
										if(item.file.path.startsWith(ppath)||item.file.path==file.parent.path){
											let style = await this.explorer.get_fileitem_style(item.file)
											await this.explorer.set_fileitem_style_of_file(item.file,style)
										}
									}
								}
								(file as any).note_chain_bgcolor = field
							}
						}

					},500)
					if(file==this.chain.current_note){
						this.timerId = this.timerId
					}
					
			})
		);
		this.wordcout = new WordCount(this,this.app);
		this.textarea = new NCTextarea(this);
		this.status = 'loaded'
	}


	async onunload() {
		await this.explorer.unregister();
		await this.explorer.sort();
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
		if(this.settings.auto_notechain){
			let notes = this.chain.get_brothers(file);
			if(notes.length==0){return;}
			let xfolders = this.settings.wordcountxfolder.split('\n').filter(x=>x!='');
			for(let item of xfolders){
				if(file.path.startsWith(item)){
					return false;
				}else if(item=='/'){
					if(file.parent?.path=='/'){
						return false;
					}
				}
			}
			if(this.explorer?.file_explorer){
				notes = this.chain.sort_tfiles(notes,(this.explorer.file_explorer as any).sortOrder);
				notes = this.chain.sort_tfiles(notes,'chain');
				await this.chain.chain_concat_tfiles(notes);
				this.explorer.sort();
			}
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
				mode = await this.dialog_suggest(
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
				let regs = await this.dialog_prompt('Enter the regular expression to replace.');
				if(regs==null){
					return;
				}
				let reg = new RegExp(regs,'g');
				
				let target = await this.dialog_prompt('Enter the target string.');
				if(target==null){
					return;
				}
				target = target.replace(
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

		let selector = document.querySelectorAll(
			'.tree-item-self.is-selected'
		)
		let items = Object.values(selector).map((x:any)=>x.dataset?.path)
		let tfiles = items.map(x=>this.chain.get_tfile(x)).filter(x=>x.extension=='md')
		if(tfiles.length>1){
			tfiles = this.chain.sort_tfiles_by_chain(tfiles)
			let notes = this.chain.get_all_tfiles()
			notes = notes.filter((x:TFile)=>!tfiles.contains(x))
			let anchor = await this.chain.sugguster_note(notes)
			if(!anchor){return}
			for(let tfile of tfiles){
				if(tfile.parent.path!=anchor.parent.path){
					let dst = anchor.parent.path+"/"+tfile.name;
					await this.app.fileManager.renameFile(tfile,dst);
				}
				await this.chain.chain_pop_node(tfile)
			}
			tfiles.unshift(anchor)
			let anchor_next = this.chain.get_next_note(anchor);
			if(anchor_next){tfiles.push(anchor_next)}
			await this.chain.chain_concat_tfiles(tfiles);
			return
		}
		
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
		const note = await this.dialog_suggest(
			this.utils.array_prefix_id(
				notes.map((file:TFile) => this.tfile_to_string(file,[],""))
			), 
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
		let mode = await this.dialog_suggest(
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
			await this.editor.set_frontmatter_align_file(
				note,
				curr,
				this.settings.field_of_confluence_tab_format
			)
		}else if(mode===this.strings.item_insert_node_after){
			await this.chain.chain_insert_node_after(curr,note);
			await this.editor.set_frontmatter_align_file(
				note,
				curr,
				this.settings.field_of_confluence_tab_format
			)
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
			let note = await this.dialog_suggest(
				this.utils.array_prefix_id(
					notes.map((file:TFile) => this.chain.tfile_to_string(file))
				),
				notes
			)
			if(note){
				await this.chain.open_note(note);
			}
		}
	}
}