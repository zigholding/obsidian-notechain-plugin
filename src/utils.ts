import {
	App,
    TFile,
    TFolder,
} from 'obsidian';
import { applyAdoptedNoteCss } from './easyapi/css';
import { noteChainPlugin, obsidianApp } from './obsidian-app';

export function array_prefix_id(items: Array<unknown>, offset = 1): string[] {
    const res: string[] = [];
    let N = items.length.toString().length;
    for(let i=0;i<items.length;i++){
        let id =  (i + offset).toString().padStart(N, '0');
        res.push(`${id} 🔥 ${items[i]}`);
    }
    return res;
}

export function concat_array<T = unknown>(items: unknown): T[] {
    if(items==null){return [];}
    if(typeof items === 'string'){return [items] as T[];}
    if(!(items instanceof Array)){return [items] as T[];}

    let res: unknown[] = [];
    for(let item of items){
        if(typeof item === 'string'){
            res.push(item);
        }else if(item instanceof Array){
            res = res.concat(this.concat_array(item));
        }else{
            res.push(item);
        }
    }
    return res as T[];
}  

export async function check_value(t: Record<string, unknown>, k: string, v: unknown, dt: number, T: number) {
    let i = 0;
    while(t[k]==null || !(t[k]===v)){
        await sleep(dt);
        i = dt+dt;
        if(i>T){break;}
    }
    if(t[k] && t[k]===v){
        return true;
    }else{
        return false;
    }
}

export function get_tp_func(app:App,target:string) {
	// 获取  templater 函数
	// get_tp_func("tp.system.prompt")

	let templater = obsidianApp(app).plugins.getPlugin(
		"templater-obsidian"
	) as {
		templater: {
			functions_generator: {
				internal_functions: {
					modules_array: Array<{
						name: string;
						static_functions: { get: (k: string) => unknown };
					}>;
				};
				user_functions: {
					user_script_functions: {
						generate_user_script_functions: () => Promise<Map<string, unknown>>;
					};
				};
			};
		};
	} | null;
    if(!templater){return null}
	let items = target.split(".");
	if(items[0].localeCompare("tp")!=0 || items.length!=3){return undefined;}
	
	let modules = templater.templater.functions_generator.
		internal_functions.modules_array.filter(
			(item)=>(item.name.localeCompare(items[1])==0)
		);

	if(modules.length==0){return undefined}
	
	return modules[0].static_functions.get(items[2]);
}

export async function get_tp_user_func(app:App,target:string) {
	// 获取  templater 函数
	// get_tp_func("tp.system.prompt")
    if(!target.match(/^tp\.user\.\w+$/)){
        return null
    }
	let templater = obsidianApp(app).plugins.getPlugin(
		"templater-obsidian"
	) as {
		templater: {
			functions_generator: {
				user_functions: {
					user_script_functions: {
						generate_user_script_functions: () => Promise<Map<string, unknown>>;
					};
				};
			};
		};
	} | null;
    if(!templater){return null}

	let items = target.split(".");
	if(items[0].localeCompare("tp")!=0 || items[1].localeCompare("user")!=0 || items.length!=3){return undefined;}
	
    let funcs  = await templater.templater.
        functions_generator.
        user_functions.
        user_script_functions.
        generate_user_script_functions();
    return funcs.get(items[2])
}

export async function get_customjs_func(target:string) {
	// 获取  templater 函数
	// get_tp_func("tp.system.prompt")
    if(!target.match(/^(cJS|customJS|customjs|customJs)(\.\w+)+$/)){
        return null
    }
    let items = target.split('.')
    const cJS = window.cJS;
    if (cJS) {
        let tmp: unknown = await cJS();
        for (const field of items.slice(1)) {
            if (!tmp || typeof tmp !== 'object') {
                return null;
            }
            tmp = (tmp as Record<string, unknown>)[field];
            if (!tmp) {
                return null;
            }
        }
        return tmp;
    }
}

export async function get_str_func(app:App,target:string) {

    let ufunc = await get_tp_func(app,target)
    if(ufunc){return ufunc}

    ufunc = await get_tp_user_func(app,target)
    if(ufunc){return ufunc}

    ufunc = await get_customjs_func(target)
    if(ufunc){return ufunc}

    return null
}


export async function toogle_note_css(app:App,document: Document,name:string,refresh=false) {
    let nc = noteChainPlugin(app);
    if (!nc) return;
    const fileApi = nc.easyapi.file;
    let tfile = fileApi.get_tfile(name);
    if(!tfile){
        let tfiles;
        if(name=='/'){
            tfiles = fileApi.get_all_tfiles()
        }else{
            let folder = fileApi.get_all_folders().filter((x:TFolder)=>x.name==name)
            if(folder.length==0){
                return;
            }
            tfiles = nc.utils.concat_array<TFile>(
                folder.map((x:TFolder)=>fileApi.get_tfiles_of_folder(x))
            );
        }
        
        if(tfiles.length==0){
            return;
        }
        tfile = await nc.chain.sugguster_note(tfiles)
        if(!tfile){
            return;
        }
    }

    const css = await nc.easyapi.editor.extract_code_block(tfile,'css')
    applyAdoptedNoteCss(document, tfile.basename, css.join('\n'), !refresh);
}