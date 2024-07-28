import { get } from 'http';
import { 
	App
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