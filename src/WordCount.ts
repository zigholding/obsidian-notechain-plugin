import { time } from 'console';
import { 
	App, Editor, MarkdownView, Modal, Notice, 
	Plugin, PluginSettingTab, Setting,
	TFile,TFolder,moment
} from 'obsidian';
import NoteChainPlugin from "../main";
import * as internal from 'stream';


export class WordCount{
	app:App;
    plugin:NoteChainPlugin;
	nretry:number;
    timerId:NodeJS.Timeout;
    curr_active_file:TFile;
    xfolders : Array<string>;

	constructor(plugin:NoteChainPlugin,app:App){
        this.plugin = plugin;
		this.app = app;
		this.nretry=100;
        this.register();
	}

    set_xfolders(s:string){
        this.xfolders = s.split('\n').filter(x=>x!='');
    }

    filter(tfile:TFile){
        if(!tfile){return false;}
        if((tfile as any).deleted){return false;}
        if(tfile.extension!='md'){return false;}
        for(let item of this.xfolders){
            if(tfile.path.startsWith(item)){
                return false;
            }
        }
        return true;
    }

    count_words(ctx:string,ignore=/[\s!"#$%&'()*+,./:;<=>?@[\]^_`{|}，。！？【】、；：“”‘’《》（）［］—…￥]/g){
        let headerRegex = /^---\s*([\s\S]*?)\s*---/
        let match = headerRegex.exec(ctx);
        if(match){
            ctx = ctx.slice(match[0].length).trim();
        }
        
        let N = ctx.replace(ignore, '').length;
        let enregex = /[a-zA-Z0-9-]+/g;
        let matches = ctx.match(enregex);
        if(matches){
            let elen=0;
            matches.forEach(x=>elen=elen+x.length);
            N = N-elen+matches.length;
        }
        return N;
    }

    async set_mtime_value(tfile:TFile,key:string,val:number){
        await this.app.fileManager.processFrontMatter(
            tfile,
            (fm) =>{
                let t = moment.unix(tfile.stat.mtime/1000);
                let mtime = t.format('YYYY-MM-DD');
                if(fm[key]==null){
                    if(val>0){
                        fm[key] = {};
                        if(mtime== moment().format('YYYY-MM-DD') && mtime!=moment.unix(tfile.stat.ctime/1000).format('YYYY-MM-DD')){
                            fm[key][t.add(-1,'days').format('YYYY-MM-DD')] = val;
                        }else{
                            fm[key][mtime] = val;
                        }
                    }
                }else{
                    let ts = Object.keys(fm[key]).sort((b,a)=>a.localeCompare(b)).filter(x=>!(x==mtime));
                    if(ts.length==0){
                        if(val>0){
                            fm[key][mtime] = val;
                        }else if(fm[key][mtime]){
                            fm[key][mtime] = val;
                        }
                    }else{
                        if((val-fm[key][ts[0]])!=0){
                            fm[key][mtime] = val;
                        }else if(fm[key][mtime]){
                            delete fm[key][mtime];
                        }
                    }
                }
            }
        )
    }

    get_new_words(tfile:TFile,day=moment().format('YYYY-MM-DD')){
        let meta = this.app.metadataCache.getFileCache(tfile);
        let values = meta?.frontmatter?.words;
        if(values){
            let keys = Object.keys(values).sort((a,b)=>a.localeCompare(b));
            let idx = keys.indexOf(day);
            if(idx<0){
                return 0;
            }else if(idx==0){
                return values[day];
            }else{
                return values[day]-values[keys[idx-1]];
            }
        }

    }

    async update_word_count(tfile:TFile){
        if(!this.filter(tfile)){return;}
        let ctx = await this.app.vault.cachedRead(tfile);
        let N = this.count_words(ctx);
        await this.set_mtime_value(tfile,'words',N);
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

    async update_word_count_of_vault(){
        let tfiles = this.app.vault.getMarkdownFiles().filter((x:TFile)=>this.filter(x));
        let i = 0;
        for(let tfile of tfiles){
            new Notice(`${i}/${tfiles.length}:${tfile.name}`,3000);
            await this.update_word_count(tfile);
            i = i+1;
        }
    }

    register(){
        this.set_xfolders(this.plugin.settings.wordcountxfolder);
		if(this.plugin.settings.wordcout){
			this.regeister_editor_change();
			this.regeister_active_leaf_change();
		}
    }

    regeister_editor_change(){
        this.plugin.registerEvent(
            this.app.workspace.on('editor-change',async (editor,info)=>{
                if(info.file?.extension!='md'){
                    return;
                }
                if(this.timerId!==null){
                    clearTimeout(this.timerId);
                }
                if(info.file){
                    this.timerId = setTimeout(()=>{
                        this.update_word_count((info as any).file);
                    }, 3000);
                }
            })
        )
    }

    regeister_active_leaf_change(){
        this.plugin.registerEvent(
            this.app.workspace.on('active-leaf-change',async (leaf)=>{

                let tfile = (leaf?.view as any).file;
                if(!leaf?.view){
                    return;
                }
                if(!((leaf.view as any)?.file?.extension=='md')){
                    return;
                }
                await this.update_word_count(tfile);
                if(this.curr_active_file==null){
                    this.curr_active_file = tfile;
                    return;
                }
                if(this.curr_active_file != tfile){
                    await this.update_word_count(this.curr_active_file);
                    this.curr_active_file = tfile;
                }
            })
        )
    }
}