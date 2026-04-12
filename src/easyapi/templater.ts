import { App, TFile,moment } from "obsidian";
import { EasyAPI } from "./easyapi";


export class Templater {
    app:App;
    ea:EasyAPI;
    constructor(app:App,ea:EasyAPI){
        this.app = app;
        this.ea = ea;
    }

    get tpl(){
        return this.ea.get_plugin('templater-obsidian');
    }

    get_tp_func(target:string) {

        let items = target.split(".");
        if(items[0].localeCompare("tp")!=0 || items.length!=3){return undefined;}
        
        let modules = this.tpl.templater.functions_generator.
            internal_functions.modules_array.filter(
                (item:any)=>(item.name.localeCompare(items[1])==0)
            );
        if(modules.length==0){return undefined}
        return modules[0].static_functions.get(items[2]);
    }

    async get_tp_user_func(target:string) {
        if(!target.match(/^tp\.user\.\w+$/)){
            return null
        }
    
        let items = target.split(".");
        if(items[0].localeCompare("tp")!=0 || items[1].localeCompare("user")!=0 || items.length!=3){return undefined;}
        
        let funcs  = await this.tpl.templater.
            functions_generator.
            user_functions.
            user_script_functions.
            generate_user_script_functions();
        return funcs.get(items[2])
    }

    async templater$1(template:string|TFile|null, active_file:TFile|null, target_file:any,extra=null) {
        let config = {
            template_file: template,
            active_file: active_file,
            target_file: target_file,
            extra: extra,
            run_mode: "DynamicProcessor",
        };

        let {templater} = this.tpl;
        let functions = await templater.functions_generator.internal_functions.generate_object(config);
        functions.user = {};
        let userScriptFunctions = await templater.functions_generator.user_functions.user_script_functions.generate_user_script_functions(config);
        userScriptFunctions.forEach((value:any,key:any)=>{
                functions.user[key] = value;
            }
        );
        if (template) {
            let userSystemFunctions = await templater.functions_generator.user_functions.user_system_functions.generate_system_functions(config);
            userSystemFunctions.forEach((value:any,key:any)=>{
                functions.user[key] = value;
            }
            );
        }
        return async(command:any)=>{
            return await templater.parser.parse_commands(command, functions);
        };
    }

    async extract_templater_block(tfile: TFile | string, reg = /<%\*\s*([\s\S]*?)\s*-?%>/g) {
        return this.ea.editor.extract_templater_block(tfile, reg);
    }

    // target_file：target>activate>template
    async parse_templater(template:string|TFile,extract=true,extra:any=null,idx:number[]|null=null,target='') {
        let file = this.ea.file.get_tfile(template)
        if(file){
            template = file
        }
        let blocks:Array<string>;
        let template_file = null;
        if(template instanceof TFile){
            template_file = template
            if(extract){
                blocks = await this.extract_templater_block(template);
            }else{
                let item = await this.ea.editor.remove_metadata(template)
                blocks = [this.ea.editor.expand_fenced_templater_in_full_text(item)]
            }
        }else{
            if(extract){
                blocks = await this.extract_templater_block(template);
            }else{
                blocks = [this.ea.editor.expand_fenced_templater_in_full_text(template)]
            }
        }
        
        let active_file = this.ea.cfile;
        let target_file:any = this.ea.file.get_tfile(target);
        if(!target){
            if(active_file){
                target_file = active_file;
            }else if (file){
                target_file = file;
            }else{
                throw new Error("Target File must be TFile");
            }
        }

        let templateFunc = await this.templater$1(template_file,active_file,target_file,extra=extra);
        if(templateFunc){
            let res = []
            if(idx){
                for(let i of idx){
                    let block = blocks[i];
                    if(block){
                        let item = await templateFunc(block);
                        res.push(item);
                    }else{
                        res.push('');
                    }
                }
            }else{
                for(let block of blocks){
                    let item = await templateFunc(block);
                    res.push(item)
                }
            }
            return res;
        }else{
            return []
        }
    }
}