
import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder } from 'obsidian';
import { on } from 'node:events';
import {EasyAPI} from 'src/easyapi/easyapi'

export class FsEditor{
    fs;
    app:App;
    path;
    api: EasyAPI;

    constructor(app: App, api:EasyAPI) {
        this.app = app;
        this.api = api;
        this.fs = (app.vault.adapter as any).fs;
        this.path = (app.vault.adapter as any).path;
    }

    get root(){
        let a = this.app.vault.adapter as any;
        return a.basePath.replace(/\\/g,'/');
    }

    get_tfile(path:string,only_first=true){
		try{
			path = path.split('|')[0].replace('[[','').replace(']]','');
			let tfile = this.app.vault.getFileByPath(path)
			if(tfile){
				return tfile;
			}
            
            if(only_first){
                let tfile = (this.app.metadataCache as any).getFirstLinkpathDest(path.split('/').last());
                if(tfile){
                    return tfile;
                }
            }else{
                let tfiles = (this.app.metadataCache as any).getLinkpathDest(path.split('/').last());
                if(tfiles && tfiles.length>0){
                    return tfiles;
                }
            }
			return null;
		}catch{
			return null
		}
	}

    get_inlinks(tfile:TFile,only_md=true):Array<TFile>{
		if(tfile==null){return [];}
		let res:Array<TFile> = []

		let inlinks = (this.app.metadataCache as any).getBacklinksForFile(tfile);
		for(let [k,v] of inlinks.data){
			let curr = this.app.vault.getFileByPath(k);
			if(curr){
				res.push(curr)
			}
		}
		return res;
	}

	get_outlinks(tfile:TFile,only_md=true):Array<TFile>{
		if(tfile==null){return [];}

		let mcache = this.app.metadataCache.getFileCache(tfile);
		if(!mcache){return [];}

		let res:Array<TFile> = [];
		if(mcache.links){
			for(let link of mcache.links){
				let tfile = this.get_tfile(link.link);
				if(tfile && !res.contains(tfile) && !(only_md && tfile.extension!='md')){
					res.push(tfile);
				}
			}
		}
		if(mcache.frontmatterLinks){
			for(let link of mcache.frontmatterLinks){
				let tfile = this.get_tfile(link.link);
				if(tfile && !res.contains(tfile) && !(only_md && tfile.extension!='md')){
					res.push(tfile);
				}
			}
		}
		if(!only_md && mcache.embeds){
			for(let link of mcache.embeds){
				let tfile = this.get_tfile(link.link);
				if(tfile && !res.contains(tfile)){
					res.push(tfile);
				}
			}
		}
		return res;
	}


    abspath(tfile:TFile|TFolder){
		if(tfile){
			return (this.root+'/'+tfile.path).replace(/\\/g,'/');
		}else{
			return null;
		}
	}

    isfile(path:string){
        return this.fs.existsSync(path) && this.fs.statSync(path).isFile();
    }

    isdir(path:string){
        return this.fs.existsSync(path) && this.fs.statSync(path).isDirectory();
    }

    list_dir(path:string,as_fullpath=true){
        if(!this.isdir(path)){return []}
        let items = this.fs.readdirSync(path)
        if(as_fullpath){
            items = items.map(
                (x:string)=>{
                    return path+'/'+x
                }
            )
        }   
        return items
    }

    first_valid_dir(paths:Array<string>|string){
        if(typeof(paths)=='string'){
            if(this.isdir(paths)){
                return paths
            }else{
                return null
            }
        }
        for(let path of paths){
            if(this.isdir(path)){
                return path;
            }
        }
        return null;
    }

    async select_valid_dir(paths:Array<string>,prompt_if_null=false){
        let xpaths = paths.filter((p:string)=>this.isdir(p));
        let path = null;
        if(xpaths.length>0){
            path = await this.api.dialog_suggest(xpaths,xpaths);
        }
        if(!path && prompt_if_null){
            path = await this.api.dialog_prompt("Root of vault");
            if(!this.isdir(path)){
                path = null
            }
        }
        return path
        
    }

    mkdir_recursive(path:string){
        if(this.isdir(path)){return true;}
        let parent = this.path.dirname(path);
        if(!this.isdir(parent)){
            this.mkdir_recursive(parent);
        }
        this.fs.mkdirSync(path);
    }

    /**
	* 附件 src 到 dst，不在 vault 中，需要绝对路径
	* overwrite，复盖；mtime，新文件；
	*/
    copy_file(src:string,dst:string,mode='pass>overwrite>mtime') {
        let fs = this.fs;

        mode = mode.split('>')[0]
        if(!fs.existsSync(src)){
            return false;
        }
        if(fs.existsSync(dst)){
            if(mode==='overwrite'){
                fs.unlinkSync(dst);
                fs.copyFileSync(src,dst);
                return true;
            }else if(mode==='mtime'){
                // dst 更新时间小于 src
                if(fs.statSync(dst).mtimeMs<fs.statSync(src).mtimeMs){
                    fs.unlinkSync(dst);
                    fs.copyFileSync(src,dst);
                    return true;
                }
            }
        }else{
            fs.copyFileSync(src,dst);
            return true;
        }
        return false;
    }

    copy_tfile(tfile:TFile, dst:string,mode='mtime') {
		if(tfile){
			let src = this.abspath(tfile);
			return src && this.copy_file(src,dst,mode);
		}
        return false;
	}

    sync_tfile(tfile:TFile,vault_root:string,mode='mtime',attachment=true,outlink=false){
        // 将笔记镜像移动到别的库中，文件结构与当前库相同
        if(tfile){
            vault_root = vault_root.replace(/\\/g,'/');
			let src = this.root + '/' + tfile.path;
            let dst = vault_root+'/'+tfile.path;
            this.mkdir_recursive(this.path.dirname(dst));
			this.copy_file(src,dst,mode);
            if(attachment){
                let tfiles = this.get_outlinks(tfile,false);
                for(let t of tfiles){
                    if(!(t.extension==='md')){
                        this.sync_tfile(t,vault_root,mode,false);
                    }else if(outlink){
                        this.sync_tfile(t,vault_root,mode,false);
                    }
                }
            }
		}
    }

    sync_tfolder(tfolder:TFolder,vault_root:string,mode='mtime',attachment=true,outlink=false,strict=false){
        if(tfolder){
            for(let t of tfolder.children){
                if(t instanceof TFolder){
                    this.sync_tfolder(t,vault_root,mode,attachment,outlink);
                }else if(t instanceof TFile){
                    this.sync_tfile(t,vault_root,mode,attachment,outlink);
                }
            }
            if(strict){
                let dst = vault_root+'/'+tfolder.path
                let src = this.abspath(tfolder)
                if(src && dst){
                    this.remove_files_not_in_src(src,dst)
                }
            }
		}
    }

    delete_file_or_dir(path:string){
        if(this.isfile(path)){
            this.fs.unlinkSync(path)
        }else if(this.isdir(path)){
            let items = this.list_dir(path,true)
            for(let item of items){
                this.delete_file_or_dir(item)
            }
            this.fs.rmdirSync(path)
        }
    }

    remove_files_not_in_src(src:string,dst:string){
        // 遍历 dst 中所有文件，如果某文件不在src中，删除
        if(!this.isdir(src) || !this.isdir(dst)){return}
        let items = this.list_dir(dst,false)
        for(let item of items){
            let adst = dst+'/'+item
            let asrc = src+'/'+item
            if(this.isfile(adst)){
                if(!this.isfile(asrc)){
                    this.fs.unlinkSync(adst)
                }
            }else if(this.isdir(adst)){
                if(!this.isdir(asrc)){
                    this.delete_file_or_dir(adst)
                }else{
                    this.remove_files_not_in_src(asrc,adst)
                }
            }
        }
    }

    sync_folder(src:string,dst:string,mode='mtime',strict=false){
        if(!this.isdir(src)){return}
        this.mkdir_recursive(dst)
        if(!this.isdir(dst)){return}

        let items = this.list_dir(src,false)
        for(let item of items){
            let asrc = this.path.join(src,item)
            let adst = this.path.join(dst,item)
            if(this.isfile(asrc)){
                this.copy_file(asrc,adst,mode)
            }else if(this.isdir(asrc)){
                this.sync_folder(asrc,adst,mode,strict)
            }
        }
        if(strict){
            this.remove_files_not_in_src(src,dst)
        }
    }

    modify(path:string,callback:Function,encoding='utf8'){
        let fs = this.fs;
        if(!fs.existsSync(path)){return};

        fs.readFile(path, encoding, (err:Error, data:string) => {
			if(err){
                return;
            }
            let rs = callback(path,data);
			fs.writeFile(path, rs, encoding, (err:Error) => {
                return;
			});
		  }
        );
    }
}