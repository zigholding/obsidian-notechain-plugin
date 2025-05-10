import { 
	Notice, TFile
} from 'obsidian';

import NoteChainPlugin from '../main';


const cmd_longform2notechain = (plugin:NoteChainPlugin) => ({
	id: "longform2notechain",
    name: plugin.strings.cmd_longform2notechain,
	icon:'git-pull-request-create-arrow',
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
				notes = notes.map((f:string)=>plugin.chain.get_tfile(f));
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
	icon:'git-pull-request-draft',
	callback: async () => {
		let nc = plugin;
		let curr = plugin.chain.current_note;
		if(curr==null || curr.parent==null){return;}

		let path = curr.parent.path+'/'+curr.parent.name+'.md';
		let dst = await nc.chain.get_tfile(path);
		if(dst==null){
			dst = await plugin.app.vault.create(
				curr.parent.path+'/'+curr.parent.name+'.md', 
				''
			)
		}

		await nc.app.fileManager.processFrontMatter(
			dst,
			fm =>{
				if(fm['longform']==null){
					fm['longform'] = {
						'format':'scenes',
						'title':dst.parent.name,
						'workflow':'Default Workflow',
						'sceneFolder':'/',
						'scenes':[],
						'ignoredFiles':[],
					};
				}
			}
		)
		
		await plugin.app.fileManager.processFrontMatter(
			dst,
			fm =>{
				if(dst==null){return;}
				if(dst.parent==null){return};

				if(fm['longform']==null){return;}
				let notes = plugin.chain.get_tfiles_of_folder(dst.parent);
				notes = plugin.chain.sort_tfiles_by_chain(notes);
				fm.longform.scenes = notes.map((f:TFile)=>f.basename);
			}
		)
		await nc.chain.open_note(dst);
	}
});


const cmd_sort_file_explorer = (plugin:NoteChainPlugin) => ({
	id: "sort_file_explorer",
    name: plugin.strings.cmd_sort_file_explorer,
	icon:'arrow-down-wide-narrow',
	callback: async () => {
		await plugin.explorer.sort(0,true);
	}
});

const cmd_open_notes_smarter = (plugin:NoteChainPlugin) => ({
	id: 'open_notes_smarter',
	name: plugin.strings.cmd_open_notes_smarter,
	icon:'binoculars',
	callback: () => {
		plugin.open_note_smarter();
	}
})

const cmd_open_note = (plugin:NoteChainPlugin) => ({
	id: 'suggestor_open_note',
	name: plugin.strings.cmd_open_note,
	icol: 'square-arrow-out-up-right',
	callback: () => {
		plugin.chain.sugguster_open_note();
	}
});

const cmd_open_prev_note = (plugin:NoteChainPlugin) => ({
	id: 'open_prev_notes',
	name: plugin.strings.cmd_open_prev_note,
	icon: 'file-output',
	callback: () => {
		plugin.chain.open_prev_notes();
	}
});

const cmd_open_next_note = (plugin:NoteChainPlugin) => ({
	id: 'open_next_notes',
	name: plugin.strings.cmd_open_next_note,
	icon: 'file-input',
	callback: () => {
		plugin.chain.open_next_notes();
	}
});


const clear_inlinks = (plugin:NoteChainPlugin) => ({
	id: 'clear_inlinks',
	name: plugin.strings.clear_inlinks,
	icon:'unlink',
	callback: () => {
		plugin.clear_inlinks();
	}
});

const move_file_to_another_folder = (plugin:NoteChainPlugin) => ({
	id: 'move_file_to_another_folder',
	name: plugin.strings.move_file_to_another_folder,
	icon:'folder-tree',
	callback: () => {
		plugin.chain.cmd_move_file_to_another_folder();
	}
});

const replace_notes_with_regx = (plugin:NoteChainPlugin) => ({
	id: 'replace_notes_with_regx',
	name: plugin.strings.replace_notes_with_regx,
	icon:'regex',
	callback: () => {
		plugin.replace_notes_with_regx();
	}
});

const chain_insert_node = (plugin:NoteChainPlugin) => ({
	id: 'chain_insert_node',
	name: plugin.strings.chain_insert_node,
	icon: 'git-branch-plus',
	callback: async () => {
		await plugin.cmd_chain_insert_node();
		await plugin.explorer.sort(500);
	}
});

const chain_set_seq_note = (plugin:NoteChainPlugin) => ({
	id: 'chain_set_seq_note',
	name: plugin.strings.chain_set_seq_note,
	icon:'wind-arrow-down',
	callback: async () => {
		await plugin.chain.chain_suggester_tfiles();
		plugin.explorer.sort();
	}
});

const chain_move_up_node = (plugin:NoteChainPlugin) => ({
	id: 'chain_move_up_node',
	name: plugin.strings.chain_move_up_node,
	icon: 'arrow-up-from-line',
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
	icon: 'arrow-down-from-line',
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
	icon: 'file-plus',
	callback: async () => {
		let targets :{[key:string]:string} = {}
		targets[plugin.strings.item_chain_insert_node_after] = 'chain_insert_node_after';
		targets[plugin.strings.item_chain_insert_node_as_tail] = 'chain_insert_node_as_tail';
		targets[plugin.strings.item_chain_insert_node_before] = 'chain_insert_node_before';
		targets[plugin.strings.item_chain_insert_node_as_head] = 'chain_insert_node_as_head';
		targets[plugin.strings.item_item_chain_insert_null] = 'null';

		let target = await plugin.dialog_suggest(
			plugin.utils.array_prefix_id(Object.keys(targets)), 
			Object.values(targets), 
			true
		);
		if(!target){return;}
		let name = await plugin.dialog_prompt(plugin.strings.prompt_notename);
		if(name){
			let curr = plugin.chain.current_note;
			if(curr && curr.parent){
				let path = curr.parent.path+'/'+name+'.md';
				let dst = await plugin.chain.get_tfile(path);
				if(dst==null){
					dst = await plugin.app.vault.create(
						curr.parent.path+'/'+name+'.md',
						''
					)
					if(!(target==='null')){
						await (plugin.chain as any)[target](dst,curr);
						if(target=='chain_insert_node_after'||target=='chain_insert_node_before'){

							await plugin.editor.set_frontmatter_align_file(
								curr,dst,plugin.settings.field_of_confluence_tab_format
							)
						}
					}
					await plugin.chain.open_note(dst);
					await plugin.explorer.sort();
				}
			}	
		}
	}
});

const cmd_reveal_note = (plugin:NoteChainPlugin) => ({
	id: 'cmd_reveal_note',
	name: plugin.strings.cmd_reveal_note,
	icon: 'locate',
	callback: async () => {
		let nc = plugin;
		let note = nc.chain.current_note;
		if(note){
			await (plugin.app as any).commands.executeCommandById('file-explorer:open')
			await (nc.explorer.file_explorer as any).tree.setCollapseAll(true);
			await (nc.explorer.file_explorer as any).revealInFolder(note);
			await sleep(100);
			
			let containerEl = nc.explorer.file_explorer.containerEl;
			let panel = containerEl.querySelector('.nav-files-container');
			let itemEl=containerEl.querySelector(`[data-path="${note.path}"]`);
			if(panel && itemEl && (itemEl as any).offsetTop){
				let xtop = panel.scrollTop+((itemEl as any).offsetTop-(panel.scrollTop+panel.clientHeight/2))
				panel.scrollTo({ top: xtop, behavior: 'smooth' });
			}
		}
	}
});


const cmd_open_and_reveal_note = (plugin:NoteChainPlugin) => ({
	id: 'cmd_open_and_reveal_note',
	name: plugin.strings.cmd_open_and_reveal_note,
	icon:'map-pin-house',
	callback: async () => {
		let nc = plugin;
		let note = await nc.chain.sugguster_note();
		if(note){
			await nc.chain.open_note(note);
			await (nc.explorer.file_explorer as any).tree.setCollapseAll(true);
			await (nc.explorer.file_explorer as any).revealInFolder(note);
			await sleep(100);
			
			let containerEl = nc.explorer.file_explorer.containerEl;
			let panel = containerEl.querySelector('.nav-files-container');
			let itemEl=containerEl.querySelector(`[data-path="${note.path}"]`);
			if(panel && itemEl && (itemEl as any).offsetTop){
				let xtop = panel.scrollTop+((itemEl as any).offsetTop-(panel.scrollTop+panel.clientHeight/2))
				panel.scrollTo({ top: xtop, behavior: 'smooth' });
			}
		}
	}
});

const cmd_open_prev_note_of_right_leaf = (plugin:NoteChainPlugin) => ({
	id: 'cmd_open_prev_note_of_right_leaf',
	name: plugin.strings.cmd_open_prev_note_of_right_leaf,
	icon: 'file-output',
	callback: async () => {
		let nc = plugin;
		let leaf = nc.chain.get_last_activate_leaf();
		if(leaf){
			let prev = nc.chain.get_prev_note((leaf.view as any).file);
			if(prev){
				await leaf.openFile(prev,{active:false});
				await nc.app.workspace.trigger('file-open', leaf);
			}
		}
	}
});

const cmd_open_next_note_of_right_leaf = (plugin:NoteChainPlugin) => ({
	id: 'cmd_open_next_note_of_right_leaf',
	name: plugin.strings.cmd_open_next_note_of_right_leaf,
	icon: 'file-input',
	callback: async () => {
		let nc = plugin;
		let leaf = nc.chain.get_last_activate_leaf();
		if(leaf){
			let next = nc.chain.get_next_note((leaf.view as any).file);
			if(next){
				await leaf.openFile(next,{active:false});
				await nc.app.workspace.trigger('file-open', leaf);
			}
		}
	}
});

const cmd_file_open_with_system_app = (plugin:NoteChainPlugin) => ({
	id: 'cmd_file_open_with_system_app',
	name: plugin.strings.cmd_file_open_with_system_app,
	icon:'book-open',
	callback: async () => {
		let nc = plugin;
		if((nc.app as any).isMobile){return;}
		let tfile = nc.chain.current_note;
		if(tfile){
			let items = await nc.chain.get_file_links(tfile);

			let keys = Object.keys(items);
			let key = await nc.dialog_suggest(
				nc.utils.array_prefix_id(keys),
				keys
			)
			
			if(key){
				let item = items[key];
				let electron = require('electron')
				electron.remote.shell.openPath(item);
			}
		}
	}
});

const cmd_file_show_in_system_explorer = (plugin:NoteChainPlugin) => ({
	id: 'cmd_file_show_in_system_explorer',
	name: plugin.strings.cmd_file_show_in_system_explorer,
	icon:'book-open-text',
	callback: async () => {
		let nc = plugin;
		if((nc.app as any).isMobile){return;}
		let tfile = nc.chain.current_note;
		if(tfile){
			let items = await nc.chain.get_file_links(tfile);
			let keys = Object.keys(items);
			let key = await nc.dialog_suggest(
				nc.utils.array_prefix_id(keys),
				keys
			)
			
			if(key){
				let item = items[key]
				let electron = require('electron')
				electron.remote.shell.showItemInFolder(item);
			}
		}
	}
});

const cmd_file_rename = (plugin:NoteChainPlugin) => ({
	id: 'cmd_file_rename',
	name: plugin.strings.cmd_file_rename,
	icon: 'pen-line',
	callback: async () => {
		let nc = plugin;
		if((nc.app as any).isMobile){return;}
		let tfile = nc.chain.current_note;

		if(tfile){
			let items:{[key:string]:any} = {}
			let links = nc.chain.get_inlinks(tfile,false);
			for(let i of links){
				if(i.extension==='md'){
					items['ℹ️ '+i.basename] = i;
				}else{
					items['ℹ️ '+i.name] = i;
				}
			}
			links = nc.chain.get_outlinks(tfile,false);
			for(let i of links){
				if(i.extension==='md'){
					items['🅾️ '+i.basename] = i;
				}else{
					items['🅾️ '+i.name] = i;
				}
			}

			let keys = Object.keys(items);
			
			let key = await nc.dialog_suggest(
				nc.utils.array_prefix_id(keys),
				keys,
			)

			if(key){
				let note = items[key];
				let res = await nc.dialog_prompt('New Name','',note.basename);
				if(res && !(res===note.basename) && !(res==='')){
					let npath = note.parent.path+'/'+res+'.'+note.extension;
					let dst = nc.chain.get_tfile(res+'.'+note.extension);
					if(dst){
						new Notice('Exist:'+res+note.extension,3000);
					}else{
						nc.app.fileManager.renameFile(note,npath);
					}
				}
			}
		}
	}
});

const cmd_mermaid_flowchart_link = (plugin: NoteChainPlugin) => ({
    id: 'cmd_mermaid_flowchart_link',
    name: plugin.strings.cmd_mermaid_flowchart_link,
	icon:'file-heart',
    callback: async () => {
        const content = "```dataviewjs\nlet nc=app.plugins.getPlugin('note-chain');\nlet msg =nc.mermaid.get_flowchart(null,2);\ndv.span(msg)\n```";
        await plugin.chain.open_note_in_modal(content);
    }
});

const cmd_mermaid_flowchart_folder = (plugin: NoteChainPlugin) => ({
    id: 'cmd_mermaid_flowchart_folder',
    name: plugin.strings.cmd_mermaid_flowchart_folder,
	icon:'folder-heart',
    callback: async () => {
        const content = "```dataviewjs\nlet nc=app.plugins.getPlugin('note-chain');\nlet msg =nc.mermaid.flowchart_folder(null,'Folder');\ndv.span(msg)\n```";
        await plugin.chain.open_note_in_modal(content);
    }
});

const cmd_mermaid_flowchart_auto = (plugin: NoteChainPlugin) => ({
    id: 'cmd_mermaid_flowchart_auto',
    name: plugin.strings.cmd_mermaid_flowchart_auto,
	icon:'heart',
    callback: async () => {
        const content = "```dataviewjs\nlet nc=app.plugins.getPlugin('note-chain');\nlet msg =nc.mermaid.get_mehrmaid_graph(null,4,'mermaid');\ndv.span(msg)\n```";
        await plugin.chain.open_note_in_modal(content);
    }
});

const cmd_execute_template_modal = (plugin: NoteChainPlugin) => ({
    id: 'cmd_execute_template_modal',
    name: plugin.strings.cmd_execute_template_modal,
	icon:'file-terminal',
    callback: async () => {
		let tpl = (plugin.app as any).plugins.plugins['templater-obsidian']
		if(!tpl){return}

		
		let tfiles:Array<TFile>=[];
		let folder = plugin.app.vault.getFolderByPath(tpl.settings.templates_folder);
		if(folder){
			let xfiles = plugin.chain.get_tfiles_of_folder(folder,true)
			let tfile = plugin.chain.get_tfile(folder.path+'/'+folder.name+'.md');
			let infiles = plugin.chain.get_links(tfile);
			for(let f of infiles){
				if(!xfiles.contains(f)){
					xfiles.push(f)
				}
			}
			xfiles = plugin.chain.sort_tfiles_by_chain(xfiles);
			for(let f of xfiles){
				tfiles.push(f);
			}
		}
		let items = plugin.settings.tpl_tags_folder.trim().split('\n');
		if(items.length>0){
			for(let item of items){
				let xfiles = plugin.chain.get_group(item);
				for(let f of xfiles){
					if(!tfiles.contains(f)){
						tfiles.push(f)
					}
				}
			}
		}
		

		let tfile = await plugin.chain.sugguster_note(tfiles as any,0,true)
		if(tfile){
			let res = await plugin.utils.parse_templater(plugin.app,tfile.basename);
			let txt = res.join('\n').trim()
			let view = (plugin.app.workspace as any).getActiveFileView()
			if(view){
				view.editor.replaceSelection(txt);
			}
		}
    }
});

const cmd_toogle_css_block_in_note = (plugin: NoteChainPlugin) => ({
    id: 'cmd_toogle_css_block_in_note',
    name: plugin.strings.cmd_toogle_css_block_in_note,
	icon:'atom',
    callback: async () => {
		await plugin.utils.toogle_note_css(plugin.app,document,'/')
    }
});

const cmd_set_frontmatter = (plugin: NoteChainPlugin) => ({
    id: 'cmd_set_frontmatter',
    name: plugin.strings.cmd_set_frontmatter,
	icon: 'database',
    callback: async () => {
		let files = plugin.chain.get_selected_files(true)
		if(files.length==0){return}
		let field = await plugin.dialog_prompt('Frontmatter name')
		if(!field){return}
		let prev = plugin.editor.get_frontmatter(files[0],field)
		if(prev){
			if(Array.isArray(prev)){
				prev = prev.map(x=>x.toString()).join('\n')
			}else{
				prev = prev.toString()
			}
		}else{
			prev = ''
		}
		let value = await plugin.dialog_prompt('Frontmatter value','',prev)
		value = value.trim()
		if(!value){return}
		value = value.replace(/\\n/g,'\n').replace(/\\t/g,'\t')
		value = value.split('\n')
		value = value.map((x:string)=>{
			if(x.match(/^-?\d+$/)){
				return parseInt(x)
			}else if(x.match(/^-?\d+(\.\d*)?$/)){
				return parseFloat(x)
			}else{
				return x
			}
		})
		if(value.length==1){
			value = value[0]
		}
		for(let tfile of files){
			await plugin.editor.set_frontmatter(tfile,field,value,1)
		}
    }
});

const cmd_move_next_level = (plugin: NoteChainPlugin) => ({
    id: 'move_next_level',
    name: plugin.strings.cmd_move_next_level,
	hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'L' }],
	icon: 'arrow-right-from-line',
    callback: async () => {
		let key = plugin.settings.field_of_confluence_tab_format
		if(!key){return}
		let tfiles = plugin.chain.get_selected_files()
		for(let tfile of tfiles){
			let level = plugin.editor.get_frontmatter(tfile,key)
			if(!level){
				await plugin.editor.set_frontmatter(tfile,key,"\t",1)
			}else{
				await plugin.editor.set_frontmatter(tfile,key,level+"\t",1)
			}
		}
    }
});

const cmd_move_none_level = (plugin: NoteChainPlugin) => ({
    id: 'move_none_level',
    name: plugin.strings.cmd_move_none_level,
	hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'K' }],
	icon:'align-justify',
    callback: async () => {
		let key = plugin.settings.field_of_confluence_tab_format
		if(!key){return}
		let tfiles = plugin.chain.get_selected_files()
		for(let tfile of tfiles){
			let level = plugin.editor.get_frontmatter(tfile,key)
			if(level){
				await plugin.editor.set_frontmatter(tfile,key,"",1)
			}
		}
    }
});

const cmd_move_prev_level = (plugin: NoteChainPlugin) => ({
    id: 'move_prev_level',
    name: plugin.strings.cmd_move_prev_level,
	hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'J' }],
	icon:'arrow-left-from-line',
    callback: async () => {
		let key = plugin.settings.field_of_confluence_tab_format
		if(!key){return}
		let tfiles = plugin.chain.get_selected_files()
		for(let tfile of tfiles){
			let level = plugin.editor.get_frontmatter(tfile,key)
			if(level){
				await plugin.editor.set_frontmatter(tfile,key,level.slice(1),1)
			}
		}
    }
});

const cmd_insert_command_id = (plugin: NoteChainPlugin) => ({
    id: 'insert_command_id',
    name: plugin.strings.cmd_insert_command_id,
	icon:'terminal',
    callback: async () => {
		
		let editor = (plugin.app as any).workspace.getActiveFileView()?.editor;
		if(!editor){return;}

		let ids :{[key:string]:string} = {}
		Object.keys(
			(plugin.app as any).commands.commands
		).forEach((x)=>{
			ids[(plugin.app as any).commands.commands[x].name]=x;}
		)

		let names = Object.keys(ids)

		let msg = plugin.utils.array_prefix_id(names);
		let cmd = await plugin.dialog_suggest(msg,names);
		if(cmd){
			editor.replaceSelection(ids[cmd]);
		}
    }
});




const commandBuilders = [
	cmd_open_note,
	cmd_reveal_note,
	cmd_open_and_reveal_note,
	cmd_open_prev_note,
	cmd_open_next_note,
	cmd_open_prev_note_of_right_leaf,
	cmd_open_next_note_of_right_leaf,
	cmd_open_notes_smarter,
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
	chain_move_down_node,
	cmd_file_rename,
	cmd_mermaid_flowchart_link,
	cmd_mermaid_flowchart_folder,
	cmd_mermaid_flowchart_auto,
	cmd_execute_template_modal,
	cmd_toogle_css_block_in_note,
	cmd_set_frontmatter,
	cmd_move_next_level,
	cmd_move_none_level,
	cmd_move_prev_level,
	cmd_insert_command_id,
];

const commandBuildersDesktop = [
	cmd_file_open_with_system_app,
	cmd_file_show_in_system_explorer,

]

export function addCommands(plugin:NoteChainPlugin) {
    commandBuilders.forEach((c) => {
        plugin.addCommand(c(plugin));
    });
	if((plugin.app as any).isMobile==false){
		commandBuildersDesktop.forEach((c) => {
			plugin.addCommand(c(plugin));
		});
	}
}
