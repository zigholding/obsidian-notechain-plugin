import { time } from 'console';
import { 
	App, Editor, MarkdownView, Modal, Notice, 
	Plugin, PluginSettingTab, Setting,
	TAbstractFile,
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

	_set_(data:any,key:string,value:any){
		let items = key.trim().split('.')
		if(!items){return}
		let curr = data
		for(let item of items.slice(0,items.length-1)){
			let kv = item.match(/^(.*?)(\[-?\d+\])?$/)
			if(!kv){return}
			let k = kv[1]
			if(kv[2]){
				let i = parseInt(kv[2].slice(1,kv[2].length-1))
				if(!(k in curr)){
					curr[k] = [{}]
					curr = curr[k][0]
				}else{
					if(Array.isArray(curr[k])){
						let tmp = {}
						if(i<0){
							curr[k].splice(-i-1,0,tmp)
						}else if(i<curr[k].length){
							curr[k][i]=tmp
						}else{
							curr[k].push(tmp)
						}
						curr = tmp
					}else{
						curr[k] = [{}]
						curr = curr[k][0]
					}
				}
			}else{
				if(!(k in curr)){
					curr[k] = {}
					curr = curr[k]
				}else{
					if(typeof(curr[k])!='object'){
						curr[k] = {}
						curr = curr[k]
					}else{
						curr = curr[k]
					}
				}
			}
		}
		let kv = items[items.length-1].match(/^(.*?)(\[-?\d+\])?$/)
		if(!kv){return}
		let k = kv[1]
		if(kv[2]){
			let i = parseInt(kv[2].slice(1,kv[2].length-1))
			if(k in curr){
				if(Array.isArray(curr[k])){
					if(i<0){
						curr[k].splice(-i-1,0,value)
					}else if(i<curr[k].length){
						curr[k][i] = value
					}else{
						curr[k].push(value)
					}
				}else{
					curr[k] = value
				}
			}else{
				curr[k] = [value]
			}
		}else{
			curr[k] = value
		}
	}

	async set_multi_frontmatter(tfile:TFile,kv:{[key:string]:any},nretry=this.nretry):Promise<boolean>{
		let flag = this.check_frontmatter(tfile,kv);
		while(!flag && nretry>0){
			await this.app.fileManager.processFrontMatter(tfile, (fm) =>{
				for(let k in kv){
					this._set_(fm,k,kv[k])
				}
			});
			await sleep(100);
			nretry = nretry-1;
			flag = this.check_frontmatter(tfile,kv);
		}
		return flag;
	}

	get_frontmatter(tfile:TFile,key:string){
		try {
			if(!tfile){return null;}
			let meta = this.app.metadataCache.getFileCache(tfile);
			if(meta?.frontmatter){
				if(meta.frontmatter[key]){
					return meta.frontmatter[key]
				}
				let keys = key.split('.')
				let cfm = meta.frontmatter
				for(let k of keys){
					let items =k.match(/^(.*?)(\[-?\d+\])?$/)
					if(!items){return null}
					if(items[1]){
						cfm = cfm[items[1]]
					}
					if(!cfm){return null}
					if(Array.isArray(cfm) && items[2]){
						let i = parseInt(items[2].slice(1,items[2].length-1))
						if(i<0){
							i = i+cfm.length
						}
						cfm = cfm[i]
					}
				}
				return cfm
			}
		} catch (error) {
			return null;
		}
	}

	get_vault_name(){
		let items = (this.plugin.app.vault.adapter as any).basePath.split('\\')
		items = items[items.length-1].split('/')
		return items[items.length-1]
	}

	get_frontmatter_config(tfile:TAbstractFile,key:string){
		if(tfile instanceof TFile){
			if(tfile.extension=='md'){
				let config = this.get_frontmatter(tfile,key)
				if(config){return config}
			}else{
				let file = this.plugin.chain.get_tfile(
					tfile.path.slice(0,tfile.path.length-tfile.extension.length)+'md'
				)
				if(file){
					let config = this.get_frontmatter(file,key)
					if(config){return config}
				}
			}
			
		}else{
			let file = this.plugin.chain.get_tfile(tfile.path+'/'+tfile.name+'.md')
			if(file){
				let config = this.get_frontmatter(file,key)
				if(config){return config}
			}
		}
		
		let dir = tfile.parent
		while(dir){
			let cfile;
			if(dir.parent){
				cfile = this.plugin.chain.get_tfile(
					dir.path+'/'+dir.name+'.md'
				)
			}else{
				cfile = this.plugin.chain.get_tfile(
					this.get_vault_name()
				)
			}
			let config = this.get_frontmatter(cfile,key)
			if(config){return config}
			dir = dir.parent
		}
		return null

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
		
		let tpls = await this.extract_code_block(tfile,'js //templater');
		for(let tpl of tpls){
			cssCodeBlocks.push(`<%*\n${tpl}\n-%>`)
		}

		return cssCodeBlocks;
	}

	async extract_yaml_block(tfile:TFile|string){
		
		if(tfile instanceof TFile){
			tfile = await this.plugin.app.vault.cachedRead(tfile);
		}
		if(typeof(tfile)!='string'){
			return ''
		}

		let headerRegex = /^---\s*([\s\S]*?)\s*---/
		let match = headerRegex.exec(tfile);
        if(match){
			return match[0]
        }
		return ''
	}

	_extract_block_id_(para:string){
		let reg = /\s+\^[a-zA-Z0-9]+\r?\n?$/
		let match = reg.exec(para)
		if(match){
			return match[0].trim()
		}else{
			return ''
		}
	}

	_generate_random_string_(length:number) {
		let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		let result = '';
	
		for (let i = 0; i < length; i++) {
			let randomIndex = Math.floor(Math.random() * characters.length);
			result += characters[randomIndex];
		}
	
		return result;
	}

	async extract_all_blocks(tfile:TFile|string){
		
		if(tfile instanceof TFile){
			tfile = await this.plugin.app.vault.cachedRead(tfile);
		}
		if(typeof(tfile)!='string'){
			return ''
		}

		let ctx = tfile;
		let blocks = [];

		let head = await this.plugin.editor.extract_yaml_block(ctx);
		if(head!=''){
			blocks.push(['YAML',head])
			ctx=ctx.slice(head.length)
		}

		let kvgets:{[key:string]:any} = {
			'空白段落':/^(\s*\n)*/,
			'代码块': /^[ \t]*```[\s\S]*?\n[ \t]*```[ \t]*\n(\s*\^[a-zA-Z0-9]+\r?[\n$])?/,
			'tpl代码块':/^<%\*[\s\S]*?\n-?\*?%>[ \t]*\n(\s+\^[a-zA-Z0-9]+\r?[\n$])?/,
			'任务': /^[ \t]*- \[.\].*\n?(\s+\^[a-zA-Z0-9]+\r?[\n$])?/,
			'无序列表': /^[ \t]*- .*\n?(\s+\^[a-zA-Z0-9]+\r?[\n$])?/,
			'有序列表': /^[ \t]*\d\. .*\n?(\s+[ \t]*\^[a-zA-Z0-9]+\r?[\n$])?/,
			'引用': /^(>.*\n)+(\s*\^[a-zA-Z0-9]+\r?[\n$])?/,
			'标题': /^#+ .*\n(\s*\^[a-zA-Z0-9]+\r?[\n$])?/,
			'段落': /^(.*\n?)(\s*\^[a-zA-Z0-9]+\r?[\n$])?/
		}
		while(ctx.length>0){
			let flag = true
			for(let key of Object.keys(kvgets)){
				let reg = kvgets[key];
				let match = reg.exec(ctx);
				if(match){
					let curr = match[0];
					if(curr.length>0){
						let bid = this._extract_block_id_(curr)
						if(key=='段落' && blocks.length>0 && blocks[blocks.length-1][0]=='段落'){
							blocks[blocks.length-1][1] = blocks[blocks.length-1][1]+curr
							blocks[blocks.length-1][2] = bid
						}else{
							blocks.push([key,curr,bid])
						}
						flag = false
						ctx=ctx.slice(curr.length)
						break
					}
				}
			}
			if(flag){
				break
			}
		}

		if(ctx.length>0){
			let bid = this._extract_block_id_(ctx)
			blocks.push(['段落',ctx,bid])
		}
		return blocks
	}

	async append_block_ids(tfile:TFile){
		let blocks = await this.extract_all_blocks(tfile);
		let items = []
		for(let block of blocks){
			if(['空白段落','YAML'].contains(block[0])){
				items.push(block[1])
			}else if(!block[2]){
				let bid = this._generate_random_string_(6)
				
				if(['任务','无序列表','有序列表'].contains(block[0])){
					items.push(block[1].slice(0,-1)+' ^'+bid+'\n')
				}else{
					if(block[1].endsWith('\n')){
						items.push(block[1]+'^'+bid+'\n')
					}else{
						items.push(block[1]+'\n^'+bid+'\n')
					}
				}
			}else{
				items.push(block[1])
			}
		}
		let res = items.join('')
		await this.app.vault.modify(tfile,res)
		return res;
	}

	async remove_block_ids(tfile:TFile){
		let blocks = await this.extract_all_blocks(tfile);
		let items = []
		for(let block of blocks){
			if(['空白段落','YAML'].contains(block[0])){
				items.push(block[1])
			}else{
				let reg = /\s+\^[a-zA-Z0-9]+\r?\n?$/
				let match = reg.exec(block[1])
				if(match){
					items.push(block[1].replace(reg,'\n'))
				}else{
					items.push(block[1])
				}
			}
		}
		let res = items.join('')
		await this.app.vault.modify(tfile,res)
		return res;
	}

	async get_current_section(){
		let view = (this.app.workspace as any).getActiveFileView()
		let editor = view.editor;
		let tfile = view.file;
		if(!view || !editor || !tfile){return null}
		let cursor = editor.getCursor();
		console.log('cursor',cursor)
		let cache = this.app.metadataCache.getFileCache(tfile)
		console.log('cache',cache)
		if(!cache){return}
		if(!cursor){
			let ctx = await this.app.vault.cachedRead(tfile);
			let items = cache?.sections?.map(
				section=>ctx.slice(section.position.start.offset,section.position.end.offset)
			)
			if(!items){return null}
			let section = await this.plugin.chain.tp_suggester(items,cache.sections)
			return section

		}else{
			let sections = cache?.sections?.filter(
				x=>{return x.position.start.line<=cursor.line && x.position.end.line>=cursor.line}
			)[0]
			return sections
		}
	}
}

