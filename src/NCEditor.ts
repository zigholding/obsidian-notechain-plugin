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
			console.log(`${tfile.basename}---${key}---${value}`);
			fm[key] = value;
		});
	}

	get_frontmatter(tfile:TFile,key:any){
		let meta = this.app.metadataCache.getFileCache(tfile);
		if(meta?.frontmatter){
			return meta.frontmatter[key];
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

	sleep(ms){
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	concat_array(items:Array<any>){
		if(items==null){return [];}
		if(typeof items === 'string'){return [items];}
		if(!(items instanceof Array)){return [items];}

		let res = [];
		for(let item of items){
			if(typeof item === 'string'){
				res.push(item);
			}else if(item instanceof Array){
				res = res.concat(this.concat_array(item));
			}else{
				res.push(item);
			}
		}
		return res;
	}

	async replace(tfile:TFile,regex:any,target:string){
		if(typeof regex === 'string'){
			await this.app.vault.process(tfile,(data)=>{
				if(data.indexOf(regex)>-1){
					console.log('Replace: ',tfile.path);
					return data.replace(regex, target);
				}
				return data;
			})
		}else if(regex instanceof RegExp){
			await this.app.vault.process(tfile,(data)=>{
				if(data.match(regex)){
					console.log('Replace: ',tfile.path);
					return data.replace(regex, target);
				}
				return data;
			})
		}
	}
}