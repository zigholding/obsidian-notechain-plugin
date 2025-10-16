


import { App, View, WorkspaceLeaf,TFile } from 'obsidian';

import {EasyAPI} from 'src/easyapi/easyapi'

export class EasyEditor {
    yamljs = require('js-yaml');
    app: App;
    ea: EasyAPI;

    constructor(app: App, api:EasyAPI) {
        this.app = app;
        this.ea = api;
    }

    cn2num(chinese:string) {
        let v = parseFloat(chinese);
        if(!Number.isNaN(v)){return v}
    
        chinese = chinese.trim()
        const cnNumbers:{[key:string]:number} = {
            "零": 0, "一": 1, "二": 2, "三": 3, "四": 4,
            "五": 5, "六": 6, "七": 7, "八": 8, "九": 9,
            "十": 10, "百": 100, "千": 1000, "万": 10000
        };
    
        let sign = 1.0;
        let i = 0;
    
        // 处理负号（JavaScript中汉字是双字节字符）
        if (i + 1 <= chinese.length && chinese[i] === "负") {
            sign = -1.0;
            i += 1;
        }
    
        let integer_total = 0;
        let decimal_total = 0.0;
        let temp = 0;
        let processing_decimal = false;
        let decimal_factor = 0.1;
    
        while (i < chinese.length) {
            const c = chinese[i];
            i += 1;
    
            // 处理小数点
            if (c === "点") {
                processing_decimal = true;
                integer_total += temp;
                temp = 0;
                continue;
            }
            if(!(c in cnNumbers)){
                return parseFloat('-')
            }
            if (!processing_decimal) {
                // 整数部分处理
                if (cnNumbers.hasOwnProperty(c)) {
                    const num = cnNumbers[c];
                    
                    if (num >= 10) {  // 处理单位
                        if (temp === 0 && num === 10) {
                            integer_total += 1 * num;  // 特殊处理"十"前无数字的情况
                        } else {
                            integer_total += temp * num;
                        }
                        temp = 0;  // 重置temp
                    } else {       // 处理数字
                        temp = temp * 10 + num;
                    }
                }
            } else {
                // 小数部分处理
                if (cnNumbers.hasOwnProperty(c) && cnNumbers[c] < 10) {
                    decimal_total += cnNumbers[c] * decimal_factor;
                    decimal_factor *= 0.1;
                }
            }
        }
    
        // 处理最后的临时值
        integer_total += temp;
    
        return sign * (integer_total + decimal_total);
    }

    slice_by_position(ctx:string,pos:any){
        if(pos.position){
            pos = pos.position
        }
        return ctx.slice(pos.start.offset,pos.end.offset);
    }
    
    parse_list_regx(aline:string,regx:RegExp,field:{[key:string]:number}={}){
        let match = aline.match(regx);
        if(!match){return null}
        let res:{[key:string]:string} = {src:aline}
        for(let k in field){
            res[k] = match[field[k]]
        }
        return res
    }
    
    parse_list_dataview(aline:string,src='_src_'){
        let res:{[key:string]:string} = {};
        if(src){
            res[src] = aline;
        }
        let regex = /[($$](.*?)::(.*?)[)$$]/g;
        let match;
        while ((match = regex.exec(aline)) !== null) {
            let key = match[1].trim();  // 提取 key 并去除两端空格
            let value = match[2].trim(); // 提取 value 并去除两端空格
            res[key] = value;
        }
        return res;
    }
    
    keys_in(keys:Array<string>,obj:object){
        for(let k of keys){
            if(!(k in obj)){
                return false
            }
        }
        return true;
    }
    
    async extract_code_block(tfile:TFile|string,btype:string){
        let xfile = this.ea.file.get_tfile(tfile);
		if(xfile){
			tfile = await this.app.vault.cachedRead(xfile);
		}
		if(typeof(tfile)!='string'){return []}

		let blocks = [];
		let reg = new RegExp(`\`\`\`${btype}\\n([\\s\\S]*?)\n\`\`\``,'g');;
		let matches;
		while ((matches = reg.exec(tfile)) !== null) {
			blocks.push(matches[1].trim()); 
		}

        reg = new RegExp(`~~~${btype}\\n([\\s\\S]*?)\n~~~`,'g');;
		while ((matches = reg.exec(tfile)) !== null) {
			blocks.push(matches[1].trim());
		}
		return blocks;
	}

    async get_selection(cancel_selection=false){
        let editor = (this.app.workspace as any).getActiveFileView()?.editor;
        if(editor){
            let sel = editor.getSelection();
            if(cancel_selection){
                let cursor = editor.getCursor(); 
                await editor.setSelection(cursor, cursor);
            }
            if(sel){
                return sel;
            }
        }
        
        let selection = window.getSelection();
        if (selection && !selection.isCollapsed) {
            const selectedText = selection.toString();
            if(selectedText){
                return selectedText;
            }   
        }
        let areas = document.querySelectorAll('textarea');
        for(let area of Array.from(areas)){
            let sel = area.value.slice(area.selectionStart,area.selectionEnd);
            
            if(sel){
                area.selectionStart = area.selectionEnd;
                area.blur();
                return sel
                }
        }
        return ''
        
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

    async get_current_section(with_section=false){
		let editor = this.ea.ceditor;
		let tfile = this.ea.cfile;
		if(!editor || !tfile){return null}
		let cursor = editor.getCursor();
		let cache = this.app.metadataCache.getFileCache(tfile)
		if(!cache || !cache?.sections){return null}
		if(cursor){
			let section = cache?.sections?.filter(
				x=>{return x.position.start.line<=cursor.line && x.position.end.line>=cursor.line}
			)[0]
            if(!section && cursor.line>cache.sections[cache.sections.length-1].position.end.line){
                section = cache.sections[cache.sections.length-1]
            }
            if(!section && cursor.line<cache.sections[0].position.start.line){
                section = cache.sections[0]
            }
            if(!section){
                return null;
            }
            let ctx = await this.app.vault.cachedRead(tfile);
            ctx = ctx.slice(
                section.position.start.offset,
                section.position.end.offset
            )
            if(with_section){
                return {
                    'section':section,
                    'sec':ctx
                }
            }else{
                return ctx;
            }
			return 
		}else{
			return null;
		}
	}

    set_obj_value(data:any,key:string,value:any){
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

    get_obj_value(data:any,key:string):any{
		try {
            // key 直接在对象中
            if(data[key]){
                return data[key]
            }

            let keys = key.split('.')
            let left = keys[0];
            let right = keys.slice(1).join('.');

            if(left){
                // key[3],key[-3]
                let items = left.match(/^(.*?)(\[-?\d+\])?$/)
                if(!items){return null}
                if(items[1]){
                    data = data[items[1]]
                }
                if(!data){return null}
                if(items[2]){
                    if(Array.isArray(data)){
                        if(data.length == 0){
                            data = null;
                        }else{
                            let i = parseInt(items[2].slice(1,items[2].length-1))
                            i = ((i % data.length) + data.length) % data.length;
                            data = data[i]
                        }
                    }else if(typeof data=='object'){
                        let keys = Object.keys(data).sort();
                        if(keys.length==0){
                            data = null;
                        }else{
                            let i = parseInt(items[2].slice(1,items[2].length-1))
                            i = ((i % keys.length) + keys.length) % keys.length;
                            data = data[keys[i]]
                        }
                    }
                }
            }
            if(!right){
                return data;
            }else{
                return this.get_obj_value(data,right);
            }
		} catch (error) {
			return null;
		}
	}

    // LINE 存在时在其之后插件，不存在在末尾
    async insert_after_line(tfile:TFile,aline:string,LINE:string, tail=true,suffix='\n\n'){
        if(!tfile){return false}
        let ctx = await this.ea.app.vault.cachedRead(tfile)

        let idx = ctx.indexOf(LINE)

        if(idx==-1 && tail){
            ctx = `${ctx}${suffix}${aline}`
        }else{
            ctx = `${ctx.slice(0,idx+LINE.length)}\n${aline}${ctx.slice(idx+LINE.length)}`
        }
        await this.ea.app.vault.modify(tfile,ctx)
        return true;
    }


}

