import {
	MarkdownView
} from 'obsidian';

import type NoteChainPlugin from '../../plugin';
import { obsidianApp } from '../../obsidian-app';

export const cmd_open_notes_smarter = (plugin:NoteChainPlugin) => ({
	id: 'open_notes_smarter',
	name: plugin.strings.cmd_open_notes_smarter,
	icon:'binoculars',
	callback: () => {
		void plugin.open_note_smarter();
	}
})

export const cmd_open_note = (plugin:NoteChainPlugin) => ({
	id: 'suggestor_open_note',
	name: plugin.strings.cmd_open_note,
	icol: 'square-arrow-out-up-right',
	callback: () => {
		void plugin.chain.sugguster_open_note();
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
			const explorer = nc.explorer.file_explorer;
			if (!explorer) return;
			await obsidianApp(plugin.app).commands.executeCommandById('file-explorer:open')
			explorer.tree?.setCollapseAll(true);
			explorer.revealInFolder?.(note);
			await sleep(100);
			
			let containerEl = explorer.containerEl;
			let panel = containerEl.querySelector('.nav-files-container');
			let itemEl=containerEl.querySelector(`[data-path="${note.path}"]`);
			if(panel && itemEl instanceof HTMLElement && itemEl.offsetTop){
				let xtop = panel.scrollTop+(itemEl.offsetTop-(panel.scrollTop+panel.clientHeight/2))
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
			const explorer = nc.explorer.file_explorer;
			if (!explorer) return;
			explorer.tree?.setCollapseAll(true);
			explorer.revealInFolder?.(note);
			await sleep(100);
			
			let containerEl = explorer.containerEl;
			let panel = containerEl.querySelector('.nav-files-container');
			let itemEl=containerEl.querySelector(`[data-path="${note.path}"]`);
			if(panel && itemEl instanceof HTMLElement && itemEl.offsetTop){
				let xtop = panel.scrollTop+(itemEl.offsetTop-(panel.scrollTop+panel.clientHeight/2))
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
			const file = leaf.view instanceof MarkdownView ? leaf.view.file : null;
			let prev = nc.chain.get_prev_note(file ?? undefined);
			if(prev){
				await leaf.openFile(prev,{active:false});
				nc.app.workspace.trigger('file-open', leaf);
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
			const file = leaf.view instanceof MarkdownView ? leaf.view.file : null;
			let next = nc.chain.get_next_note(file ?? undefined);
			if(next){
				await leaf.openFile(next,{active:false});
				nc.app.workspace.trigger('file-open', leaf);
			}
		}
	}
});

