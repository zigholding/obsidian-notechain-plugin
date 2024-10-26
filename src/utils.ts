import { get } from 'http';
import { 
	App,
    TFile,
    Notice,
    TFolder,
    TAbstractFile
} from 'obsidian';

export function get_plugins(app:App,name:string){

}

export function array_prefix_id(items:Array<any>,offset=1){
    let res = new Array();
    let N = items.length.toString().length;
    for(let i=0;i<items.length;i++){
        let id =  (i + offset).toString().padStart(N, '0');
        res.push(`${id} 🔥 ${items[i]}`);
    }
    return res;
}

export function concat_array(items:Array<any>){
    if(items==null){return [];}
    if(typeof items === 'string'){return [items];}
    if(!(items instanceof Array)){return [items];}

    let res = [] as any [];
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

export async function check_value(t:any,k:any,v:any,dt:number,T:number){
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

	let templater = (app as any).plugins.getPlugin(
		"templater-obsidian"
	);

	let items = target.split(".");
	if(items[0].localeCompare("tp")!=0 || items.length!=3){return undefined;}
	
	let modules = templater.templater.functions_generator.
		internal_functions.modules_array.filter(
			(item:any)=>(item.name.localeCompare(items[1])==0)
		);

	if(modules.length==0){return undefined}
	
	return modules[0].static_functions.get(items[2]);
}

export async function get_tp_user_func(app:App,target:string) {
	// 获取  templater 函数
	// get_tp_func("tp.system.prompt")

	let templater = (app as any).plugins.getPlugin(
		"templater-obsidian"
	);

	let items = target.split(".");
	if(items[0].localeCompare("tp")!=0 || items[1].localeCompare("user")!=0 || items.length!=3){return undefined;}
	
    let funcs  = await templater.templater.
        functions_generator.
        user_functions.
        user_script_functions.
        generate_user_script_functions();
    return funcs.get(items[2])
}

async function templater$1(app:App,template:string, active_file:TFile, target_file:TFile) {
	const config = {
		template_file: template,
		active_file: active_file,
		target_file: target_file,
		run_mode: "DynamicProcessor",
	};
	const plugins = (app as any).plugins.plugins;
	const exists = plugins["templater-obsidian"];
	if (!exists) {
		new Notice("Templater is not installed. Please install it.");
		return;
	}
	// eslint-disable-next-line
	// @ts-ignore
	const {templater} = plugins["templater-obsidian"];
	const functions = await templater.functions_generator.internal_functions.generate_object(config);
	functions.user = {};
	const userScriptFunctions = await templater.functions_generator.user_functions.user_script_functions.generate_user_script_functions(config);
	userScriptFunctions.forEach((value:any,key:any)=>{
		functions.user[key] = value;
	}
	);
	if (template) {
		const userSystemFunctions = await templater.functions_generator.user_functions.user_system_functions.generate_system_functions(config);
		userSystemFunctions.forEach((value:any,key:any)=>{
			functions.user[key] = value;
		}
		);
	}
	return async(command:any)=>{
		return await templater.parser.parse_commands(command, functions);
	};
}

export async function parse_templater(app:App,template:string,without_meta=true) {
    let nc =(app as any).plugins.getPlugin('note-chain');
    if(!nc){return;}

    let file = nc.chain.get_tfile(template);
    if (file instanceof TFile) {
        template = await app.vault.read(file);
        if(without_meta){
            let headerRegex = /^---\s*([\s\S]*?)\s*---/
            let match = headerRegex.exec(template);
            if(match){
                template = template.slice(match[0].length).trim();
            }
        }
    }
    
    let notes = app.vault.getMarkdownFiles();
    if(notes.length==0){return;}
    let active_file = notes[0];
    let target_file =  notes[0];
    let templateFunc = await templater$1(app,'',active_file,target_file);
    return templateFunc ? await templateFunc(template) : undefined;
}

export async function toogle_note_css(app:App,document:any,name:string,refresh=false) {
    let nc = (app as any).plugins.getPlugin('note-chain');
    let tfile = nc.chain.get_tfile(name);
    if(!tfile){
        let folder = nc.chain.get_all_folders().filter((x:TFolder)=>x.name==name)
        console.log(folder)
        if(folder.length==0){
            return;
        }
        let tfiles = nc.utils.concat_array(
            folder.map((x:TFolder)=>nc.chain.get_tfiles_of_folder(x))
        );
        if(tfiles.length==0){
            return;
        }
        tfile = await nc.chain.sugguster_note(tfiles)
        if(!tfile){
            return;
        }
    }

    let link = document.getElementById(tfile.basename);
    if(link){
        link.remove()
        if(refresh){
            let txt = await app.vault.cachedRead(tfile);
            txt = txt.replace('```css\n','').replace('\n```','');
            link.innerHTML=txt;
        }
        // link.disable = !link.disable;
    }else{
        let txt = await app.vault.cachedRead(tfile);
        txt = txt.replace('```css\n','').replace('\n```','');
        let styleElement = document.createElement('style')
        styleElement.innerHTML=txt;
        styleElement.id = tfile.basename;
        document.head.appendChild(styleElement);
    }
}