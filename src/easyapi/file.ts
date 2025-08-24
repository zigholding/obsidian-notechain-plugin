


import { App, View, WorkspaceLeaf,TFile,TFolder } from 'obsidian';

import {EasyAPI} from 'src/easyapi/easyapi'

export class File {
    app: App;
    api: EasyAPI;

    constructor(app: App, api:EasyAPI) {
        this.app = app;
        this.api = api;
    }

    get_tfile(path:string|TFile,only_first=true){
		try{
			if(path instanceof TFile){
				return path;
			}
			path = path.split('|')[0].replace('![[','').replace('[[','').replace(']]','');
			let tfile = this.app.vault.getFileByPath(path)
			if(tfile){
				return tfile;
			}

			let tfiles = (this.app.metadataCache as any).uniqueFileLookup.get(path.toLowerCase());
			if(!tfiles){
				tfiles = (this.app.metadataCache as any).uniqueFileLookup.get(path.toLowerCase()+'.md');
				if(!tfiles){
					return null;
				}else{
					path = path+'.md'
				}
			}

			let ctfiles = tfiles.filter((x:TFile)=>x.name==path)
			if(ctfiles.length>0){
				if(only_first){
					return ctfiles[0]
				}else{
					return ctfiles
				}
			}

			if(tfiles.length>0){
				if(only_first){
					return tfiles[0]
				}else{
					return tfiles
				}
			}
			return null;
		}catch{
			return null
		}
	}

	get_all_tfiles(){
		let files = this.app.vault.getMarkdownFiles();
		return files;
	}

	get_tfiles_of_folder(tfolder:TFolder|null,n=0):any{
		if(!tfolder){return [];}
		let notes = [];
		for(let c of tfolder.children){
			if(c instanceof TFile && c.extension==='md'){
				notes.push(c);
			}else if(c instanceof TFolder && n!=0){
				let tmp = this.get_tfiles_of_folder(c,n-1);
				for(let x of tmp){
					notes.push(x);
				}
			}
		}
		return notes;
	}

	get_all_tfiles_of_tags(tags:string|Array<string>,sort_mode=''){
		if(!Array.isArray(tags)){
			tags = [tags]
		}

		tags = tags.map(x=>{
			if(x.startsWith('#')){
				return x;
			}else{
				return '#'+x;
			}
		})

		let tfiles = this.get_all_tfiles().filter(x=>{
			let ttags = this.get_tags(x);
			for(let tag of tags){
				if(ttags.contains(tag)){
					return true;
				}
			}
		})
		return tfiles;
	}

    generate_structure(tfolder:TFolder, depth = 0, isRoot = true,only_folder=false,only_md=true) {
        let structure = '';
        const indentUnit = '    '; // 关键修改点：每层缩进 4 空格
        const verticalLine = '│   '; // 垂直连接线密度增强
        const indent = verticalLine.repeat(Math.max(depth - 1, 0)) + indentUnit.repeat(depth > 0 ? 1 : 0);
        const children = tfolder.children || [];
    
        // 显示根目录名称
        if (isRoot) {
            structure += `${tfolder.name}/\n`;
            isRoot = false;
        }
    
        children.forEach((child, index) => {
            const isLast = index === children.length - 1;
            const prefix = isLast ? '└── ' : '├── '; // 统一符号风格
    
            if (child instanceof TFolder) {
                // 目录节点：增加垂直连接线密度
                structure += `${indent}${prefix}${child.name}/\n`;
                structure += this.generate_structure(child, depth + 1, isRoot,only_folder,only_md);
            } else if(!only_folder) {
                // 文件节点：对齐符号与目录
                if(only_md && (child as TFile).extension!='md'){return}
                structure += `${indent}${prefix}${child.name}\n`;
            }
        });
        return structure;
    }

	get_tags(tfile:TFile){
		if(!tfile){return []}
		let mcache= this.app.metadataCache.getFileCache(tfile);
		let tags:Array<string> = []
		if(mcache?.tags){
			for(let curr of mcache.tags){
				if(!tags.contains(curr.tag)){
					tags.push(curr.tag)
				}
			}
		}
		if(mcache?.frontmatter?.tags){
			if(Array.isArray(mcache.frontmatter.tags)){
				for(let curr of mcache.frontmatter.tags){
					let tag = '#'+curr;
					if(!tags.contains(tag)){
						tags.push(tag)
					}
				}
			}else if(typeof mcache.frontmatter.tags === 'string'){
				let tag = `#`+mcache.frontmatter.tags
				if(!tags.contains(tag)){
					tags.push(tag)
				}
			}
			
		}
		return tags
	}
}

