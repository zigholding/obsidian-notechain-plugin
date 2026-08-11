import {
	Notice, TFile, TFolder
} from 'obsidian';

import type NoteChainPlugin from '../../plugin';

export const cmd_toogle_css_block_in_note = (plugin: NoteChainPlugin) => ({
    id: 'cmd_toogle_css_block_in_note',
    name: plugin.strings.cmd_toogle_css_block_in_note,
	icon:'atom',
    callback: async () => {
		await plugin.utils.toogle_note_css(plugin.app,document,'/')
    }
});

export const cmd_set_frontmatter = (plugin: NoteChainPlugin) => ({
    id: 'cmd_set_frontmatter',
    name: plugin.strings.cmd_set_frontmatter,
	icon: 'database',
    callback: async () => {
		let files = plugin.easyapi.file.get_selected_files(true)
		if(files.length==0){return}
		let field = await plugin.easyapi.dialog_prompt('Frontmatter name')
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
		let value = await plugin.easyapi.dialog_prompt('Frontmatter value','',prev)
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

export const cmd_pick_note_background_color = (plugin: NoteChainPlugin) => ({
	id: 'pick-note-background-color',
	name: plugin.strings.cmd_pick_note_background_color,
	icon: 'palette',
	callback: async () => {
		const field = plugin.settings.notechain.field_of_background_color?.trim();
		if (!field) {
			new Notice(
				plugin.strings.language === 'zh'
					? '请先在 Note Chain 设置中填写「背景色字段」'
					: 'Set the background color field name in Note Chain settings first'
			);
			return;
		}
		const tfile = plugin.chain.current_note;
		if (!tfile) {
			new Notice(plugin.strings.language === 'zh' ? '没有当前笔记' : 'No active note');
			return;
		}
		const initial = plugin.editor.get_frontmatter(tfile, field) || '#add8e6';
		const color = await plugin.easyapi.dialog_color(	
			initial,
			[],
			plugin.strings.cmd_pick_note_background_color,
		);
		if (color == null) return;
		await plugin.editor.set_frontmatter(tfile, field, color, 1);
	}
});

export const cmd_move_next_level = (plugin: NoteChainPlugin) => ({
    id: 'move_next_level',
    name: plugin.strings.cmd_move_next_level,
	hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'L' }],
	icon: 'arrow-right-from-line',
    callback: async () => {
		let key = plugin.settings.notechain.field_of_confluence_tab_format
		if(!key){return}
		let tfiles = plugin.easyapi.file.get_selected_files()
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

export const cmd_move_none_level = (plugin: NoteChainPlugin) => ({
    id: 'move_none_level',
    name: plugin.strings.cmd_move_none_level,
	hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'K' }],
	icon:'align-justify',
    callback: async () => {
		let key = plugin.settings.notechain.field_of_confluence_tab_format
		if(!key){return}
		let tfiles = plugin.easyapi.file.get_selected_files()
		for(let tfile of tfiles){
			let level = plugin.editor.get_frontmatter(tfile,key)
			if(level){
				await plugin.editor.set_frontmatter(tfile,key,"",1)
			}
		}
    }
});

export const cmd_move_prev_level = (plugin: NoteChainPlugin) => ({
    id: 'move_prev_level',
    name: plugin.strings.cmd_move_prev_level,
	hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'J' }],
	icon:'arrow-left-from-line',
    callback: async () => {
		let key = plugin.settings.notechain.field_of_confluence_tab_format
		if(!key){return}
		let tfiles = plugin.easyapi.file.get_selected_files()
		for(let tfile of tfiles){
			let level = plugin.editor.get_frontmatter(tfile,key)
			if(level){
				await plugin.editor.set_frontmatter(tfile,key,level.slice(1),1)
			}
		}
    }
});

