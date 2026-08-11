import {
	Notice, TFile, TFolder
} from 'obsidian';

import type NoteChainPlugin from '../../plugin';

export const cmd_longform2notechain = (plugin:NoteChainPlugin) => ({
	id: "longform2notechain",
    name: plugin.strings.cmd_longform2notechain,
	icon:'git-pull-request-create-arrow',
	callback: async () => {
		let curr = plugin.chain.current_note;
		if(curr == null || curr.parent==null){return;}
		curr = await plugin.chain.get_folder_note(curr.parent,false);
		if(curr==null){return;}

		plugin.app.fileManager.processFrontMatter(
			curr,
			async (fm) =>{
				async function set_confluence_level(scenes:any,level=0){
					if(Array.isArray(scenes)){
						for(let scene of scenes){
							if(Array.isArray(scene)){
								set_confluence_level(scene,level+1);
							}else{
								set_confluence_level(scene,level);
							}
						}
					}else if(typeof scenes === 'string'){
						let note = plugin.easyapi.file.get_tfile(scenes);
						if(note){
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

				if(fm['longform']==null){return;}
				let scenes = plugin.utils.concat_array(fm.longform.scenes);
				await set_confluence_level(fm.longform.scenes);
				let ignoredFiles = plugin.utils.concat_array(fm.longform.ignoredFiles);
				await set_confluence_level(fm.longform.ignoredFiles);

				ignoredFiles = ignoredFiles.filter((f:string)=>!scenes.contains(f));
				let notes = plugin.utils.concat_array([scenes,ignoredFiles]);
				if(!notes || notes.length==0){
					return;
				}
				
				if(!notes.contains(curr.basename)){
					notes.unshift(curr.basename);
				}

				notes = notes.map((f:string)=>plugin.easyapi.file.get_tfile(f));
				if(curr.parent==null){return};
				let tfiles = plugin.easyapi.file.get_tfiles_of_folder(curr.parent).filter((f:any)=>!notes.contains(f));
				notes = plugin.utils.concat_array([tfiles,notes]);
				await plugin.chain.chain_concat_tfiles(notes);
				plugin.explorer.sort();
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
		await plugin.app.fileManager.processFrontMatter(
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
				if(dst==null){return;}
				if(dst.parent==null){return};
				if(fm['longform']==null){return;}
				let notes = plugin.easyapi.file.get_tfiles_of_folder(dst.parent);
				notes = plugin.chain.sort_tfiles_by_chain(notes);
				
				let levels = notes.map((f:TFile)=>plugin.chain.get_confluence_level(f));
				notes = notes.map((x:TFile)=>x.basename);
				if(notes.length>0){
					let source = `scenes:\n`;
					for(let i in notes){
						let note = notes[i];
						let level = levels[i];
						source += '  ';
						for(let j=-1;j<level;j++){
							source += `- `;
						}
						source += `${note}\n`;
					}

					let config = plugin.easyapi.editor.yamljs.load(source);
					
					notes = config['scenes'];
				}
				fm.longform.scenes = notes;
			}
		)
		await nc.chain.open_note(dst);
	}
});

