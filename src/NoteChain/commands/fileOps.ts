import {
	Notice, TFile, TFolder
} from 'obsidian';

import type NoteChainPlugin from '../../plugin';

export const cmd_sort_file_explorer = (plugin:NoteChainPlugin) => ({
	id: "sort_file_explorer",
    name: plugin.strings.cmd_sort_file_explorer,
	icon:'lucide-refresh-cw',
	callback: async () => {
		await plugin.explorer.sort(0,true);
		await plugin.explorer.set_fileitem_style();
		await plugin.explorer.set_display_text();
	}
});

export const clear_inlinks = (plugin:NoteChainPlugin) => ({
	id: 'clear_inlinks',
	name: plugin.strings.clear_inlinks,
	icon:'unlink',
	callback: () => {
		plugin.clear_inlinks();
	}
});

export const move_file_to_another_folder = (plugin:NoteChainPlugin) => ({
	id: 'move_file_to_another_folder',
	name: plugin.strings.move_file_to_another_folder,
	icon:'folder-tree',
	callback: () => {
		plugin.chain.cmd_move_file_to_another_folder();
	}
});

export const replace_notes_with_regx = (plugin:NoteChainPlugin) => ({
	id: 'replace_notes_with_regx',
	name: plugin.strings.replace_notes_with_regx,
	icon:'regex',
	callback: async () => {
		let notes = await plugin.chain.suggester_notes();
		if (notes?.length > 0) {
			try {
				let regs = await plugin.easyapi.dialog_prompt('Enter the regular expression to replace.');
				if (regs == null) {
					return;
				}
				let reg = new RegExp(regs, 'g');

				let target = await plugin.easyapi.dialog_prompt('Enter the target string.');
				if (target == null) {
					return;
				}
				target = target.replace(
					/\\n/g, '\n'
				);
				for (let note of notes) {
					await plugin.easyapi.editor.replace(note, reg, target);
				}
			} catch (error) {

			}

		}
	}
});

export const cmd_file_open_with_system_app = (plugin:NoteChainPlugin) => ({
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
			let key = await nc.easyapi.dialog_suggest(
				nc.utils.array_prefix_id(keys),
				keys
			)
			
			if(key){
				let item = items[key];
				let electron = require('electron')
				if(item.startsWith('https://') || item.startsWith('http://')){
					electron.remote.shell.openExternal(item);
				}else{
					electron.remote.shell.openPath(item);
				}
				
			}
		}
	}
});

export const cmd_file_show_in_system_explorer = (plugin:NoteChainPlugin) => ({
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
			let key = await nc.easyapi.dialog_suggest(
				nc.utils.array_prefix_id(keys),
				keys
			)
			
			if(key){
				let item = items[key]
				let electron = require('electron')
				if(item.startsWith('https://') || item.startsWith('http://')){
					await electron.remote.shell.openExternal(item);
				}else{
					await electron.remote.shell.showItemInFolder(item);
				}
			}
		}
	}
});

export const cmd_file_rename = (plugin:NoteChainPlugin) => ({
	id: 'cmd_file_rename',
	name: plugin.strings.cmd_file_rename,
	icon: 'pen-line',
	callback: async () => {
		let nc = plugin;
		if((nc.app as any).isMobile){return;}
		let tfile = nc.chain.current_note;

		if(tfile){
			let items:{[key:string]:any} = {}
			let links = nc.easyapi.file.get_inlinks(tfile,false);
			for(let i of links){
				if(i.extension==='md'){
					items['ℹ️ '+i.basename] = i;
				}else{
					items['ℹ️ '+i.name] = i;
				}
			}
			links = nc.easyapi.file.get_outlinks(tfile,false);
			for(let i of links){
				if(i.extension==='md'){
					items['🅾️ '+i.basename] = i;
				}else{
					items['🅾️ '+i.name] = i;
				}
			}

			let keys = Object.keys(items);
			
			let key = await nc.easyapi.dialog_suggest(
				nc.utils.array_prefix_id(keys),
				keys,
			)

			if(key){
				let note = items[key];
				let res = await nc.easyapi.dialog_prompt('New Name','',note.basename);
				if(res && !(res===note.basename) && !(res==='')){
					let npath = note.parent.path+'/'+res+'.'+note.extension;
					let dst = plugin.easyapi.file.get_tfile(res+'.'+note.extension);
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

