import {
	Notice, TFile, TFolder
} from 'obsidian';

import type NoteChainPlugin from '../../plugin';

export const chain_insert_node = (plugin:NoteChainPlugin) => ({
	id: 'chain_insert_node',
	name: plugin.strings.chain_insert_node,
	icon: 'git-branch-plus',
	callback: async () => {
		await plugin.cmd_chain_insert_node();
		await plugin.explorer.sort(500);
	}
});

export const chain_set_seq_note = (plugin:NoteChainPlugin) => ({
	id: 'chain_set_seq_note',
	name: plugin.strings.chain_set_seq_note,
	icon:'wind-arrow-down',
	callback: async () => {
		await plugin.chain.chain_suggester_tfiles();
		plugin.explorer.sort();
	}
});

export const chain_move_up_node = (plugin:NoteChainPlugin) => ({
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

export const chain_move_down_node = (plugin:NoteChainPlugin) => ({
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

export const create_new_note = (plugin:NoteChainPlugin) => ({
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

		let target = await plugin.easyapi.dialog_suggest(
			plugin.utils.array_prefix_id(Object.keys(targets)), 
			Object.values(targets), 
			true
		);
		if(!target){return;}
		let name = await plugin.easyapi.dialog_prompt(plugin.strings.prompt_notename);
		if(name){
			let curr = plugin.chain.current_note;
			if(curr && curr.parent){
				let path = curr.parent.path+'/'+name+'.md';
				let dst = await plugin.easyapi.file.get_tfile(path);
				if(dst==null){
					dst = await plugin.app.vault.create(
						curr.parent.path+'/'+name+'.md',
						''
					)
					if(!(target==='null')){
						await (plugin.chain as any)[target](dst,curr);
						if(target=='chain_insert_node_after'||target=='chain_insert_node_before'){
							await plugin.editor.set_frontmatter_align_file(
								curr,dst,plugin.settings.notechain.field_of_confluence_tab_format
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

