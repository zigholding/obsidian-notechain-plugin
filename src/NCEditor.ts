import { 
	App, Editor, MarkdownView, Modal, Notice, 
	Plugin, PluginSettingTab, Setting,
	TFile,TFolder
} from 'obsidian';


export class NCEditor{
	app:App;

	constructor(app:App){
		this.app = app;
	}

	async set_frontmatter(tfile:TFile,key:string,value:any){
		let prev = this.get_frontmatter(tfile,key);
		if(prev===value){return;}

		await this.app.fileManager.processFrontMatter(tfile,fm =>{
			fm[key] = value;
		});
		let meta = this.app.metadataCache.getFileCache(tfile);
		if(meta){
			if(meta.frontmatter){
				meta.frontmatter[key] = value;
			}else{
				meta['frontmatter'] ={
					key:value
				}
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