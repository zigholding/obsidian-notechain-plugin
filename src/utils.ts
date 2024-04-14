import { 
	App, Editor, MarkdownView, Modal, Notice, 
	Plugin, PluginSettingTab, Setting,
	TFile,TFolder
} from 'obsidian';


export function get_tp_func(app:App,target:string) {
	// 获取  templater 函数
	// get_tp_func("tp.system.prompt")

	let templater = app.plugins.getPlugin(
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


export function set_prototype(t, e) {
    // 当 e 中有多个多个函数时，返回一个函数，执行所有函数
    //
    let r = Object.keys(e).map(i=>set_prototype_on(t, i, e[i]));
    return r.length === 1 ? r[0] : function() {
        r.forEach(i=>i())
    }
}

function set_prototype_on(prototype, name, func) {
    // prototype：目标对象 Object.prototype 或 object.constructor.prototype
    // name：属性名
    // func: 传参为 func(prototype[name])，组合执行新函数和旧函数
	let org_func = prototype[name]
	  , isOwnProperty = prototype.hasOwnProperty(name)
	  , final_func = func(org_func);
    
    
    if(org_func){
        Object.setPrototypeOf(final_func, org_func);
    }
    Object.setPrototypeOf(a, final_func);
    prototype[name] = a;
    return s;

	function a(...d) {
        if(final_func === org_func && prototype[name] === a){
            s();
        }
		return  final_func.apply(this, d);
	}
	function s() {
        if(prototype[name] === a){
            if(isOwnProperty){
                prototype[name] = org_func;
            }else{
                delete prototype[name];
            }
        }
        if(final_func !== org_func){
            final_func = org_func;
            Object.setPrototypeOf(a, org_func || Function)
        }
	}
}