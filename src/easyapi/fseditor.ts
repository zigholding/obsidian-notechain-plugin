
import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder } from 'obsidian';
import { on } from 'node:events';
import {EasyAPI} from 'src/easyapi/easyapi'

export class FsEditor{
    fs;
    app:App;
    path;
    easyapi: EasyAPI;

    constructor(app: App, easyapi:EasyAPI) {
        this.app = app;
        this.easyapi = easyapi;
        this.fs = (app.vault.adapter as any).fs;
        this.path = (app.vault.adapter as any).path;
    }

    get root(){
        let a = this.app.vault.adapter as any;
        return a.basePath.replace(/\\/g,'/');
    }

	/**
	 * `${key@noteRef}` → frontmatter `key` of note resolved by `noteRef` (path, `[[link]]`, or basename; dotted keys like `a.b`).
	 */
	private expandPropertyAtLinkPath(s: string): string {
		return s.replace(
			/\$\{([^@}]+)@([^}]+)\}/g,
			(_m, rawKey: string, rawNoteRef: string) => {
				const key = rawKey.trim();
				const noteRef = rawNoteRef.trim();
				if (!key || !noteRef) return "";
				const linked = this.easyapi.file.get_tfile(noteRef);
				if (!linked || !(linked instanceof TFile)) return "";
				const v = this.easyapi.editor.get_frontmatter(linked, key, null);
				return this.frontmatterValueToPathString(v);
			},
		);
	}

	private frontmatterValueToPathString(v: unknown): string {
		if (v == null) return "";
		if (typeof v === "string") return v;
		if (typeof v === "number" || typeof v === "boolean") return String(v);
		if (Array.isArray(v)) {
			const paths = v.filter((x): x is string => typeof x === "string");
			if (paths.length === 0) return "";
			const hit = this.first_valid_path(paths);
			return hit ?? "";
		}
		try {
			return JSON.stringify(v);
		} catch {
			return "";
		}
	}

    abspath(tfile:TFile|TFolder|string,strict=true): string | null {
		if(tfile instanceof TFile){
			return (this.root+'/'+tfile.path).replace(/\\/g,'/');
		}
        
        if(tfile instanceof TFolder){
			return (this.root+'/'+tfile.path).replace(/\\/g,'/');
		}
        
        if(typeof tfile === 'string'){
            tfile = tfile.replace(/\$\{ROOT\}/g,this.root);
            tfile = tfile.replace(/\$\{VAULT\}/g,this.app.vault.getName());
            tfile = this.expandPropertyAtLinkPath(tfile);


            let xfile = this.easyapi.file.get_tfile(tfile);
            if(xfile){
                return this.abspath(xfile);
            }
            
            let xfolder = this.app.vault.getFolderByPath(tfile);
            if(xfolder){
                return this.abspath(xfolder);
            }
            
            if(!strict){
                return tfile;
            }

            if(this.isfile(tfile)){
                return tfile;
            }

            if(this.isdir(tfile)){
                return tfile;
            }
            return null;
		}
        
        return null;
	}

    isPath(path:string){
        return this.fs.existsSync(path);
    }

    isfile(path:string){
        return this.fs.existsSync(path) && this.fs.statSync(path).isFile();
    }

    isdir(path:string){
        return this.fs.existsSync(path) && this.fs.statSync(path).isDirectory();
    }

    get_outfiles(tfile= this.easyapi.cfile): string[] | null {
        if (tfile == null) {
            return [];
        }
        let res: string[] = [];
        let mcache = this.app.metadataCache.getFileCache(tfile);
    
        
        if (mcache && mcache.links) {
            for (let link of mcache.links) {
                let ii = this.list_dir(link.link,true,-1,true);
                for (let i of ii) {
                    if (!res.includes(i)) {
                        res.push(i);
                    }
                }
            }
        }
    
        if (mcache && mcache.embeds) {
            for (let link of mcache.embeds) {
                let ii = this.list_dir(link.link,true,-1,true);
                for (let i of ii) {
                    if (!res.includes(i)) {
                        res.push(i);
                    }
                }
            }
        }
    
        return res;
    }
    
    async read_file(path:string,encoding='utf8'){
        let tfile = this.easyapi.file.get_tfile(path);
        if(tfile){
            return await this.app.vault.read(tfile);
        }

        path = this.abspath(path,true) || path;
        if(!this.isfile(path)){return null}

        return await this.fs.readFileSync(path,encoding);
    }

    list_dir(path:string,only_files=false,recursive=0,exclude_hidden=true):string[]{
        path = this.abspath(path,true) || path;
        if(this.isfile(path)){return [path]}
        if(!this.isdir(path)){return []}
        let names = this.fs.readdirSync(path)
        if(exclude_hidden){
            names = names.filter((x:string)=>!x.startsWith('.'))
        }
        const fullPaths = names.map((x:string)=>path+'/'+x)
        const files: string[] = []
        const subdirs: string[] = []
        for (const fp of fullPaths) {
            if (this.isfile(fp)) files.push(fp)
            else if (this.isdir(fp)) subdirs.push(fp)
        }
        let items: string[] = only_files ? [...files] : [...files, ...subdirs]
        if(recursive!=0){
            for (const dir of subdirs) {
                items.push(...this.list_dir(dir, only_files, recursive-1, exclude_hidden));
            }
        }
        return items
    }

    first_valid_path(paths:Array<string>|string){
        if(typeof(paths)=='string'){
            if(this.isfile(paths) || this.isdir(paths)){
                return paths
            }else{
                return null
            }
        }
        for(let path of paths){
            if(this.isfile(path)||this.isdir(path)){
                return path
            }
        }
        return null
    }

    first_valid_file(paths:Array<string>|string){
        if(typeof(paths)=='string'){
            if(this.isfile(paths)){
                return paths
            }else{
                return null
            }
        }
        for(let path of paths){
            if(this.isfile(path)){
                return path
            }
        }
        return null
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
            path = await this.easyapi.dialog_suggest(xpaths,xpaths);
        }
        if(!path && prompt_if_null){
            path = await this.easyapi.dialog_prompt("Root of vault");
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
                let tfiles = this.easyapi.file.get_outlinks(tfile,false);
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