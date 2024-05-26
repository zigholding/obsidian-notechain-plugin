import { time } from 'console';
import { 
	App, Editor, MarkdownView, Modal, Notice, 
	Plugin, PluginSettingTab, Setting,
	TFile,TFolder
} from 'obsidian';
import * as internal from 'stream';


export class NCEditor{
	app:App;
	nretry:number;

	constructor(app:App){
		this.app = app;
		this.nretry=100;
	}

	async set_frontmatter(tfile:TFile,key:string,value:any,nretry=this.nretry){
		let kv:{[key:string]:string} = {};
		kv[key] = value;
		return this.set_multi_frontmatter(tfile,kv,nretry);
	}

	check_frontmatter(tfile:TFile,kv:{[key:string]:any}){
		try {
			if(!tfile){return null;}
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

	async set_multi_frontmatter(tfile:TFile,kv:{[key:string]:any},nretry=this.nretry):Promise<boolean>{
		if(!tfile || this.check_frontmatter(tfile,kv)){
			return true;
		}

		await this.app.fileManager.processFrontMatter(tfile, (fm) =>{
			for(let k in kv){
				fm[k] = kv[k];
			}
		});
		await sleep(100*(this.nretry-nretry));
		if(nretry!=0){
			return this.set_multi_frontmatter(tfile,kv,nretry-1);
		}else{
			if(!this.check_frontmatter(tfile,kv)){
				new Notice("Fail to set frontmatter: "+tfile.basename,5000);
				return false;
			}else{
				return true;
			}
		}
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
}