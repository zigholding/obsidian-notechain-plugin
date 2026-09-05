import {
	Notice, TFile, TFolder
} from 'obsidian';

import type NoteChainPlugin from '../../plugin';
import { isRecord } from '../../ts-helpers';

export const cmd_longform2notechain = (plugin:NoteChainPlugin) => ({
	id: "longform2notechain",
    name: plugin.strings.cmd_longform2notechain,
	icon:'git-pull-request-create-arrow',
	callback: async () => {
		let curr = plugin.chain.current_note;
		if(curr == null || curr.parent==null){return;}
		curr = await plugin.chain.get_folder_note(curr.parent,false);
		if(curr==null){return;}

		await plugin.app.fileManager.processFrontMatter(
			curr,
			async (fm) =>{
				async function set_confluence_level(scenes: unknown, level=0): Promise<void> {
					if(Array.isArray(scenes)){
						for(let scene of scenes){
							if(Array.isArray(scene)){
								await set_confluence_level(scene,level+1);
							}else{
								await set_confluence_level(scene,level);
							}
						}
					}else if(typeof scenes === 'string'){
						let note = plugin.easyapi.file.get_tfile(scenes);
						if(note instanceof TFile){
							let slevel = '\t'.repeat(level);
							let prelevel = plugin.editor.get_frontmatter(note,plugin.settings.notechain.field_of_confluence_tab_format);
							if(prelevel==slevel || (prelevel==null && slevel=='')){return;}
							await plugin.editor.set_frontmatter(
								note,plugin.settings.notechain.field_of_confluence_tab_format,
								slevel
							);
						}
					}
				}
				
				if(!curr){return;}
				if(!isRecord(fm)){return;}
				const longform = fm['longform'];
				if(!isRecord(longform)){return;}
				let scenes = plugin.utils.concat_array<string>(longform['scenes']);
				await set_confluence_level(longform['scenes']);
				let ignoredFiles = plugin.utils.concat_array<string>(longform['ignoredFiles']);
				await set_confluence_level(longform['ignoredFiles']);

				ignoredFiles = ignoredFiles.filter((f:string)=>!scenes.contains(f));
				let names = plugin.utils.concat_array<string>([scenes,ignoredFiles]);
				if(!names || names.length==0){
					return;
				}
				
				if(!names.contains(curr.basename)){
					names.unshift(curr.basename);
				}

				const notes = names.map((f:string)=>plugin.easyapi.file.get_tfile(f)).filter((f): f is TFile => f instanceof TFile);
				if(curr.parent==null){return};
				let tfiles = plugin.easyapi.file.get_tfiles_of_folder(curr.parent).filter((f:TFile)=>!notes.contains(f));
				await plugin.chain.chain_concat_tfiles(plugin.utils.concat_array<TFile>([tfiles,notes]));
				await plugin.explorer.sort();
			}
		)
	}
});

export const cmd_longform4notechain = (plugin:NoteChainPlugin) => ({
	id: "longform4notechain",
    name: plugin.strings.cmd_longform4notechain,
	icon:'git-pull-request-draft',
	callback: async () => {
		let nc = plugin;
		let curr = plugin.chain.current_note;
		if(curr==null || curr.parent==null){return;}
		

		let path = curr.parent.path+'/'+curr.parent.name+'.md';
		let dst = await nc.easyapi.file.get_tfile(path);
		if(dst==null){
			dst = await plugin.app.vault.create(
				curr.parent.path+'/'+curr.parent.name+'.md', 
				''
			)
		}
		if (!(dst instanceof TFile)) { return; }
		await plugin.app.fileManager.processFrontMatter(
			dst,
			fm =>{
				if(!isRecord(fm)){return;}
				if(!isRecord(fm['longform'])){
					fm['longform'] = {
						'format':'scenes',
						'title': dst.parent?.name ?? '',
						'workflow':'Default Workflow',
						'sceneFolder':'/',
						'scenes':[],
						'ignoredFiles':[],
					};
				}
				if(dst==null){return;}
				if(dst.parent==null){return};
				const longform = fm['longform'];
				if(!isRecord(longform)){return;}
				let notes = plugin.easyapi.file.get_tfiles_of_folder(dst.parent);
				notes = plugin.chain.sort_tfiles_by_chain(notes).filter((f): f is TFile => f instanceof TFile);
				
				let levels = notes.map((f:TFile)=>plugin.chain.get_confluence_level(f));
				const names = notes.map((x:TFile)=>x.basename);
				let scenesOut: unknown = notes;
				if(names.length>0){
					let source = `scenes:\n`;
					for(let i in names){
						let note = names[i];
						let level = levels[i];
						source += '  ';
						for(let j=-1;j<level;j++){
							source += `- `;
						}
						source += `${note}\n`;
					}

					let config = plugin.easyapi.editor.yamljs.load(source);
					if(isRecord(config)){
						scenesOut = config['scenes'];
					}
				}
				longform['scenes'] = scenesOut;
			}
		)
		await nc.chain.open_note(dst);
	}
});

