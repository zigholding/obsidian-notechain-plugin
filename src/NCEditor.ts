import { time } from 'console';
import { 
	App, Editor, MarkdownView, Modal, Notice, 
	Plugin, PluginSettingTab, Setting,
	TFile,TFolder
} from 'obsidian';
import * as internal from 'stream';
import NoteChainPlugin from "../main";


export class NCEditor{
	app:App;
	nretry:number;
	plugin:NoteChainPlugin;

	constructor(plugin:NoteChainPlugin){
		this.plugin = plugin;
		this.app = this.plugin.app;
		this.nretry=100;
	}

	async set_frontmatter(tfile:TFile,key:string,value:any,nretry=this.nretry){
		let kv:{[key:string]:string} = {};
		kv[key] = value;
		let flag = await this.set_multi_frontmatter(tfile,kv,nretry);
		return flag;
	}

	check_frontmatter(tfile:TFile,kv:{[key:string]:any}):boolean{
		try {
			if(!tfile){return false;}
			let meta = this.app.metadataCache.getFileCache(tfile);
			if(meta?.frontmatter){
				for(let k in kv){
					if(!(meta.frontmatter[k]==kv[k])){
						return false;
					}
				}
				return true;
			}
			return false;
		} catch (error) {
			return false;
		}
	}

	async wait_frontmatter(tfile:TFile,kv:{[key:string]:any},nretry=this.nretry):Promise<boolean>{
		let flag = this.check_frontmatter(tfile,kv);
		
		while(!flag && nretry>0){
			await sleep(50);
			nretry = nretry-1;
			flag = this.check_frontmatter(tfile,kv);
		}
		return flag;
	}

	async set_multi_frontmatter(tfile:TFile,kv:{[key:string]:any},nretry=this.nretry):Promise<boolean>{
		let flag = this.check_frontmatter(tfile,kv);
		while(!flag && nretry>0){

			await this.app.fileManager.processFrontMatter(tfile, (fm) =>{
				for(let k in kv){
					fm[k] = kv[k];
				}
			});
			await sleep(100);
			nretry = nretry-1;
			flag = this.check_frontmatter(tfile,kv);
		}
		return flag;
	}

	get_frontmatter(tfile:TFile,key:any){
		try {
			if(!tfile){return null;}
			let meta = this.app.metadataCache.getFileCache(tfile);
			if(meta?.frontmatter){
				return meta.frontmatter[key];
			}
		} catch (error) {
			return null;
		}
	}

	regexp_link(tfile:TFile,mode:string){
		//[[note||alias]]
		if(mode==='link'){
			return new RegExp(`\\[\\[${tfile.basename}\\|?.*\\]\\]`,'g');
		}
		
		//paragraph
		if(mode==='para'){
			return new RegExp(`.*\\[\\[${tfile.basename}\\|?.*\\]\\].*`,'g');
		}
	}

	async replace(tfile:TFile,regex:any,target:string){
		if(typeof regex === 'string'){
			await this.app.vault.process(tfile,(data)=>{
				if(data.indexOf(regex)>-1){
					return data.replace(regex, target);
				}
				return data;
			})
		}else if(regex instanceof RegExp){
			await this.app.vault.process(tfile,(data)=>{
				if(data.match(regex)){
					return data.replace(regex, target);
				}
				return data;
			})
		}
	}

	async remove_metadata(tfile:TFile|string){
		if(tfile instanceof TFile){
			tfile = await this.plugin.app.vault.cachedRead(tfile);
		}
		if(typeof(tfile)!='string'){
			return ''
		}

		let headerRegex = /^---\s*([\s\S]*?)\s*---/
		let match = headerRegex.exec(tfile);
		if(match){
			tfile = tfile.slice(match[0].length).trim();
		}
		return tfile;
	}

	async extract_code_block(tfile:TFile|string,btype:string){

		if(tfile instanceof TFile){
			tfile = await this.plugin.app.vault.cachedRead(tfile);
		}
		if(typeof(tfile)!='string'){
			return ''
		}
		let cssCodeBlocks = [];
		let reg = new RegExp(`\`\`\`${btype}\\n([\\s\\S]*?)\n\`\`\``,'g');;
		let matches;
		while ((matches = reg.exec(tfile)) !== null) {
			cssCodeBlocks.push(matches[1].trim()); // Extract the CSS code without backticks
		}
		return cssCodeBlocks;
	}

	async extract_templater_block(tfile:TFile|string,reg=/<%\*\s*([\s\S]*?)\s*-?%>/g){
		if(tfile instanceof TFile){
			tfile = await this.plugin.app.vault.cachedRead(tfile);
		}
		if(typeof(tfile)!='string'){
			return ''
		}

		let cssCodeBlocks = [];
		let matches;
		while ((matches = reg.exec(tfile)) !== null) {
			cssCodeBlocks.push(matches[0].trim());
		}
		return cssCodeBlocks;
	}
}