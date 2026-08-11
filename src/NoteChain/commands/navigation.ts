import {
	Notice, TFile, TFolder
} from 'obsidian';

import type NoteChainPlugin from '../../plugin';

export const cmd_open_notes_smarter = (plugin:NoteChainPlugin) => ({
	id: 'open_notes_smarter',
	name: plugin.strings.cmd_open_notes_smarter,
	icon:'binoculars',
	callback: () => {
		plugin.open_note_smarter();
	}
})

export const cmd_open_note = (plugin:NoteChainPlugin) => ({
	id: 'suggestor_open_note',
	name: plugin.strings.cmd_open_note,
	icol: 'square-arrow-out-up-right',
	callback: () => {
		plugin.chain.sugguster_open_note();
	}
});

export const cmd_open_prev_note = (plugin:NoteChainPlugin) => ({
	id: 'open_prev_notes',
	name: plugin.strings.cmd_open_prev_note,
	icon: 'file-output',
	callback: () => {
		plugin.chain.open_prev_notes();
	}
});

export const cmd_open_next_note = (plugin:NoteChainPlugin) => ({
	id: 'open_next_notes',
	name: plugin.strings.cmd_open_next_note,
	icon: 'file-input',
	callback: () => {
		plugin.chain.open_next_notes();
	}
});

export const cmd_reveal_note = (plugin:NoteChainPlugin) => ({
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


export const cmd_open_and_reveal_note = (plugin:NoteChainPlugin) => ({
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

export const cmd_open_prev_note_of_right_leaf = (plugin:NoteChainPlugin) => ({
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

export const cmd_open_next_note_of_right_leaf = (plugin:NoteChainPlugin) => ({
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

