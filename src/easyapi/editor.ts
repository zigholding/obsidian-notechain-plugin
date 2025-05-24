


import { App, View, WorkspaceLeaf,TFile } from 'obsidian';

import {EasyAPI} from 'src/easyapi/easyapi'

export class EasyEditor {
    yamljs = require('js-yaml');
    app: App;
    api: EasyAPI;

    constructor(app: App, api:EasyAPI) {
        this.app = app;
        this.api = api;
    }
    
    async get_selection(cancel_selection=false){
        let editor = (this.app.workspace as any).getActiveFileView()?.editor;
        if(editor){
            let sel = editor.getSelection();
            if(cancel_selection){
                let cursor = editor.getCursor(); 
                await editor.setSelection(cursor, cursor);
            }
            return sel;
        }else{
            return '';
        }
    }

    async get_code_section(tfile:TFile,ctype='',idx=0,as_simple=true){
        let dvmeta = this.app.metadataCache.getFileCache(tfile);
        let ctx = await this.app.vault.cachedRead(tfile);
        let section = dvmeta?.sections?.filter(x=>x.type=='code').filter(x=>{
            let c = ctx.slice(x.position.start.offset,x.position.end.offset).trim();
            return c.startsWith('```'+ctype) || c.startsWith('~~~'+ctype);
        })[idx]
        if(section){
            let c = ctx.slice(
                section.position.start.offset,
                section.position.end.offset
            );
            
            if(as_simple){
                return c.slice(4+ctype.length,c.length-4)
            }else{
                let res = {
                    code:c,
                    section:section,
                    ctx:ctx
                }
                return res;
            }
        }
    }

    async get_heading_section(tfile:TFile,heading:string,idx=0, with_heading=true){
        let dvmeta = this.app.metadataCache.getFileCache(tfile);
        let ctx = await this.app.vault.cachedRead(tfile);
        if(!dvmeta?.headings){
            return '';
        }
        let section = dvmeta?.headings?.filter(x=>x.heading==heading)[idx]
        if(section){
            let idx = dvmeta.headings.indexOf(section)+1;
            while(idx<dvmeta.headings.length){
                let csec = dvmeta.headings[idx];
                if(csec.level<=section.level){
                    break
                }
                idx = idx+1;
            }
            if(idx<dvmeta.headings.length){
                let csec = dvmeta.headings[idx];
                let c = ctx.slice(
                    with_heading?section.position.start.offset : section.position.end.offset,
                    csec.position.start.offset
                );
                return c;
            }else{
                let c = ctx.slice(
                    with_heading?section.position.start.offset : section.position.end.offset,
                );
                return c;
            }
        }
    }

    async get_current_section(){
		let editor = this.api.ceditor;
		let tfile = this.api.cfile;
		if(!editor || !tfile){return null}
		let cursor = editor.getCursor();
		let cache = this.app.metadataCache.getFileCache(tfile)
		if(!cache){return null}
		if(cursor){
			let section = cache?.sections?.filter(
				x=>{return x.position.start.line<=cursor.line && x.position.end.line>=cursor.line}
			)[0]
            let ctx = await this.app.vault.cachedRead(tfile);
            if(!section){return ''}
			return ctx.slice(
                section.position.start.offset,
                section.position.end.offset
            )
		}else{
			return null;
		}
	}

    dict_set_value(data:any,key:string,value:any){
		let items = key.trim().split('.')
		if(!items){return}
		let curr = data
		for(let item of items.slice(0,items.length-1)){
			let kv = item.match(/^(.*?)(\[-?\d+\])?$/) // 匹配数组索引, 如 key[0] 或 key
			if(!kv){return}
			let k = kv[1] // 键名
			if(kv[2]){ // 有索引
				let i = parseInt(kv[2].slice(1,kv[2].length-1)) // 索引
				if(!(k in curr)){ // 键不存在
					curr[k] = [{}] // 创建空数组
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
}

