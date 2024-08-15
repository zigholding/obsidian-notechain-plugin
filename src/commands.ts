import { 
	App, Editor, MarkdownView, Modal, Notice, 
	CachedMetadata,
	Plugin,
	TAbstractFile,
	TFile,TFolder
} from 'obsidian';

import NoteChainPlugin from '../main';


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
	callback: async () => {
		let nc = plugin;
		let curr = plugin.chain.current_note;
		if(curr==null || curr.parent==null){return;}

		let path = curr.parent.path+'/'+curr.parent.name+'.md';
		let dst = await nc.chain.get_tfile(path);
		if(dst==null){
			let ufunc = nc.utils.get_tp_func(nc.app,'tp.file.create_new');
			dst = await ufunc(
				'',curr.parent.name,
				false,curr.parent
			);
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
	callback: async () => {
		await plugin.explorer.sort(0,true);
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

const cmd_open_prev_note = (plugin:NoteChainPlugin) => ({
	id: 'open_prev_notes',
	name: plugin.strings.cmd_open_prev_note,
	callback: () => {
		plugin.chain.open_prev_notes();
	}
});

const cmd_open_next_note = (plugin:NoteChainPlugin) => ({
	id: 'open_next_notes',
	name: plugin.strings.cmd_open_next_note,
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

const cmd_reveal_note = (plugin:NoteChainPlugin) => ({
	id: 'cmd_reveal_note',
	name: plugin.strings.cmd_reveal_note,
	callback: async () => {
		let nc = plugin;
		let note = nc.chain.current_note;
		if(note){
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
	callback: async () => {
		let nc = plugin;
		let leaf = nc.chain.get_neighbor_leaf(1);
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
	callback: async () => {
		let nc = plugin;
		let leaf = nc.chain.get_neighbor_leaf(1);
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
	callback: async () => {
		let nc = plugin;
		if((nc.app as any).isMobile){return;}
		let tfile = nc.chain.current_note;
		if(tfile){
			let items = await nc.chain.get_file_links(tfile);

			let keys = Object.keys(items);
			let key = await nc.chain.tp_suggester(
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
	callback: async () => {
		let nc = plugin;
		if((nc.app as any).isMobile){return;}
		let tfile = nc.chain.current_note;
		if(tfile){
			let items = await nc.chain.get_file_links(tfile);
			let keys = Object.keys(items);
			let key = await nc.chain.tp_suggester(
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
	callback: async () => {
		let nc = plugin;
		if((nc.app as any).isMobile){return;}
		let tfile = nc.chain.current_note;

		if(tfile){
			let items:{[key:string]:any} = {}
			let links = nc.chain.get_inlinks();
			for(let i of links){
				if(i.extension==='md'){
					items['ℹ️ '+i.basename] = i;
				}else{
					items['ℹ️ '+i.name] = i;
				}
			}
			links = nc.chain.get_outlinks();
			for(let i of links){
				if(i.extension==='md'){
					items['🅾️ '+i.basename] = i;
				}else{
					items['🅾️ '+i.name] = i;
				}
			}

			let keys = Object.keys(items);
			
			let key = await nc.chain.tp_suggester(
				nc.utils.array_prefix_id(keys),
				keys,
			)

			if(key){
				let note = items[key];
				let res = await nc.chain.tp_prompt('New Name',note.basename);
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
	cmd_file_rename
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
