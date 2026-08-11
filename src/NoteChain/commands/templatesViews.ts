import {
	Notice, TFile, TFolder
} from 'obsidian';

import type NoteChainPlugin from '../../plugin';

export const cmd_execute_template_modal = (plugin: NoteChainPlugin) => ({
    id: 'cmd_execute_template_modal',
    name: plugin.strings.cmd_execute_template_modal,
	icon:'file-terminal',
    callback: async () => {
		let tpl = (plugin.app as any).plugins.plugins['templater-obsidian']
		if(!tpl){return}

		
		let tfiles:Array<TFile>=[];
		let folder = plugin.app.vault.getFolderByPath(tpl.settings.templates_folder);
		if(folder){
			let xfiles = plugin.easyapi.file.get_tfiles_of_folder(folder,-1)
			let tfile = plugin.easyapi.file.get_tfile(folder.path+'/'+folder.name+'.md');
			let infiles = plugin.easyapi.file.get_links(tfile);
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
		let items = plugin.settings.notechain.tpl_tags_folder.trim().split('\n');
		if(items.length>0){
			for(let item of items){
				let xfiles = plugin.easyapi.file.get_group(item);
				for(let f of xfiles){
					if(!tfiles.contains(f)){
						tfiles.push(f)
					}
				}
			}
		}
		

		let tfile = await plugin.chain.sugguster_note(tfiles as any,0,true)
		if(tfile){
			let res = await plugin.easyapi.tpl.parse_templater(tfile.basename);
			let txt = res.join('\n').trim()
			let view = (plugin.app.workspace as any).getActiveFileView()
			if(view){
				view.editor.replaceSelection(txt);
			}
		}
    }
});

export const cmd_insert_command_id = (plugin: NoteChainPlugin) => ({
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
		let cmd = await plugin.easyapi.dialog_suggest(msg,names);
		if(cmd){
			editor.replaceSelection(ids[cmd]);
		}
    }
});

export const cmd_open_note_in_modal = (plugin: NoteChainPlugin) => ({
    id: 'cmd_open_note_in_modal',
    name: plugin.strings.cmd_open_note_in_modal,
	icon:'Laptop',
    callback: async () => {
		
		let note = await plugin.chain.sugguster_note();
		if(note){
			plugin.chain.open_note_in_modal(note.path);
		}
    }
});

export const cmd_open_note_in_view = (plugin: NoteChainPlugin) => ({
    id: 'cmd_open_note_in_view',
    name: plugin.strings.cmd_open_note_in_view,
	icon:'Panels Top Left',
    callback: async () => {
		let note = await plugin.chain.sugguster_note(null,0,false,true);
		if(typeof note === 'string'){
			plugin.chain.open_note_in_view(note);
		}else{
			plugin.chain.open_note_in_view(note.path);
		}
    }
});

export const cmd_execut_current_note  = (plugin: NoteChainPlugin) => ({
    id: 'cmd_execut_current_note',
    name: plugin.strings.cmd_execut_current_note,
	icon:'Panels Top Left',
	hotkeys: [{ modifiers: ['Alt'], key: 'R' }],
    callback: async () => {
		let cfile = plugin.chain.current_note;
		if(!cfile){return}

		let ctx = await plugin.app.vault.cachedRead(cfile);
		let flag = false;
		if (/\n```js\s*(\/\/)?(templater|tpl)\n/.test(ctx)){
			new Notice(`执行当前脚本：${cfile.basename}`)
			flag = true;
			plugin.easyapi.tpl.parse_templater(cfile.basename)
		}
		if(ctx.search('\n```css\n')>0){
			let all_css = await plugin.easyapi.editor.extract_code_block(cfile,'css');
			let css = all_css.join('\n\n\n').trim();
			if(css!=''){
				flag = true;
				// 将 css 写入 snippets
				new Notice(`切换当前样式：${cfile.basename}`)
				let cpath = plugin.app.vault.configDir+'/'+'snippets'+'/'+cfile.basename+'.css';
				await plugin.app.vault.adapter.write(cpath,css);
				
				// 在配置文件中添加 css
				let config = await (plugin.app.vault as any).readJson(plugin.app.vault.configDir+'/'+'appearance.json');
				if(!config['enabledCssSnippets'].contains(cfile.basename)){
					config['enabledCssSnippets'].push(cfile.basename);
					await (plugin.app.vault as any).writeJson(plugin.app.vault.configDir+'/'+'appearance.json',config);
				}
				plugin.utils.toogle_note_css(plugin.app,document,cfile.basename,false)
			}
		}
		if(!flag){
			plugin.chain.open_note_in_modal(cfile.path);
		}
    }
});

