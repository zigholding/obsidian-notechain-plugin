import {
	TFile,Notice
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

		let hasLongform = false;
		let longformScenes: unknown;
		let longformIgnored: unknown;
		await plugin.app.fileManager.processFrontMatter(
			curr,
			(fm) =>{
				if(!isRecord(fm)){return;}
				const longform = fm['longform'];
				if(!isRecord(longform)){return;}
				longformScenes = longform['scenes'];
				longformIgnored = longform['ignoredFiles'];
				hasLongform = true;
			}
		);
		if(!hasLongform){return;}

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

		let scenes = plugin.utils.concat_array<string>(longformScenes);
		await set_confluence_level(longformScenes);
		let ignoredFiles = plugin.utils.concat_array<string>(longformIgnored);
		await set_confluence_level(longformIgnored);

		ignoredFiles = ignoredFiles.filter((f:string)=>!scenes.contains(f));
		let names = plugin.utils.concat_array<string>([scenes,ignoredFiles]);
		if(!names || names.length==0){
			return;
		}

		if(!names.contains(curr.basename)){
			names.unshift(curr.basename);
		}

		if(curr.parent==null){return};

		let brothers = plugin.easyapi.file.get_tfiles_of_folder(curr.parent);
		const byName = new Map(brothers.map((f:TFile) => [f.basename, f]));
		let notes = names.map((n:string) => byName.get(n)).filter((f): f is TFile => f instanceof TFile);
		let tfiles = brothers.filter((f:TFile)=>!names.contains(f.basename));
		let chain = plugin.utils.concat_array<TFile>([notes,tfiles]);
		await plugin.chain.chain_concat_tfiles(chain);
		await plugin.explorer.sort();
		new Notice(plugin.strings.cmd_longform2notechain+': done');
		return;
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
		let dst = nc.easyapi.file.get_tfile(path);
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
					for (let i = 0; i < names.length; i++) {
						const note = names[i];
						const level = levels[i];
						source += '  ';
						for (let j = -1; j < level; j++) {
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

