import { App, Plugin, TFile } from "obsidian";
import { EasyAPI } from "./easyapi";
import { isRecord } from "../ts-helpers";

interface TemplaterModule {
    name: string;
    static_functions: Map<string, unknown>;
}

interface TemplaterFunctionsGenerator {
    internal_functions: {
        modules_array: TemplaterModule[];
        generate_object: (config: unknown) => Promise<Record<string, unknown> & { user?: Record<string, unknown> }>;
    };
    user_functions: {
        user_script_functions: {
            generate_user_script_functions: (config?: unknown) => Promise<Map<string, unknown>>;
        };
        user_system_functions: {
            generate_system_functions: (config: unknown) => Promise<Map<string, unknown>>;
        };
    };
}

interface TemplaterObsidianPlugin extends Plugin {
    templater: {
        functions_generator: TemplaterFunctionsGenerator;
        overwrite_file_commands?: unknown;
        create_new_note_from_template?: unknown;
        current_user_templates?: unknown;
        parser: {
            parse_commands: (command: string, functions: unknown) => Promise<unknown>;
        };
    };
}

export class Templater {
    app:App;
    ea:EasyAPI;
    private temp_target_file: TFile | null = null;
    constructor(app:App,ea:EasyAPI){
        this.app = app;
        this.ea = ea;
    }

    get tpl(): TemplaterObsidianPlugin | undefined {
        return this.ea.get_plugin<TemplaterObsidianPlugin>('templater-obsidian');
    }

    get_tp_func(target:string) {

        let items = target.split(".");
        if(items[0].localeCompare("tp")!=0 || items.length!=3){return undefined;}
        if (!this.tpl) { return undefined; }
        
        let modules = this.tpl.templater.functions_generator.
            internal_functions.modules_array.filter(
                (item)=>(item.name.localeCompare(items[1])==0)
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
        if (!this.tpl) { return undefined; }
        
        let funcs  = await this.tpl.templater.
            functions_generator.
            user_functions.
            user_script_functions.
            generate_user_script_functions();
        return funcs.get(items[2])
    }

    async templater$1(template:string|TFile|null, active_file:TFile|null, target_file: TFile | null, extra: unknown = null) {
        let config = {
            template_file: template,
            active_file: active_file,
            target_file: target_file,
            extra: extra,
            run_mode: "DynamicProcessor",
        };

        const tplPlugin = this.tpl;
        if (!tplPlugin) { return; }
        let {templater} = tplPlugin;
        let functions = await templater.functions_generator.internal_functions.generate_object(config);
        functions.user = {};
        let userScriptFunctions = await templater.functions_generator.user_functions.user_script_functions.generate_user_script_functions(config);
        userScriptFunctions.forEach((value, key)=>{
                functions.user![key] = value;
            }
        );
        if (template) {
            let userSystemFunctions = await templater.functions_generator.user_functions.user_system_functions.generate_system_functions(config);
            userSystemFunctions.forEach((value, key)=>{
                functions.user![key] = value;
            }
            );
        }
        return async(command: string)=>{
            return await templater.parser.parse_commands(command, functions);
        };
    }

    async extract_templater_block(tfile: TFile | string, reg = /<%\*\s*([\s\S]*?)\s*-?%>/g) {
        return this.ea.editor.extract_templater_block(tfile, reg);
    }

    private async ensure_temp_target_file() {
        if (this.temp_target_file) {
            const existed = this.app.vault.getFileByPath(this.temp_target_file.path);
            if (existed) {
                this.temp_target_file = existed;
                return this.temp_target_file;
            }
        }

        const path = `note-chain-templater-target.md`;
        const existed = this.ea.file.get_tfile(path);
        if (existed) {
            this.temp_target_file = existed;
            return existed;
        }
        try {
            this.temp_target_file = await this.app.vault.create(path, "");
            return this.temp_target_file;
        } catch {
            const createdByOtherCall = this.app.vault.getFileByPath(path);
            if (createdByOtherCall) {
                this.temp_target_file = createdByOtherCall;
                return createdByOtherCall;
            }
            throw new Error(`Failed to create templater temp target: ${path}`);
        }
    }

    // target_file：target>activate>template
    async parse_templater(template:string|TFile,extract=true,extra: unknown =null,idx:number[]|null|number=null,target='') {
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
        let target_file: TFile | null = this.ea.file.get_tfile(target);
        if(!target_file && isRecord(extra)){
            const ref = extra.target_file || extra.tfile || extra.cfile;
            if (typeof ref === 'string' || ref instanceof TFile) {
                target_file = this.ea.file.get_tfile(ref);
            }
        }
        if(!target_file){
            if(active_file){
                target_file = active_file;
            }else if (file){
                target_file = file;
            }else{
                target_file = await this.ensure_temp_target_file();
            }
        }
        if(!active_file){
            // Templater internal dynamic functions may access active_file.path.
            active_file = target_file;
        }

        // Keep primitives (e.g. title string from wxmp) as-is.
        // Only shallow-copy plain objects so callers cannot mutate config.extra.
        const runtime_extra =
            extra == null
                ? null
                : (typeof extra === 'object' && !Array.isArray(extra) ? { ...extra } : extra);

        // Templater internals may read template_file.path even in dynamic mode.
        // When input template is raw text, fallback to target_file to avoid null access.
        const runtime_template_file = template_file || target_file;

        let templateFunc = await this.templater$1(runtime_template_file,active_file,target_file,extra=runtime_extra);
        if(templateFunc){
            let res = []
            if(idx!=null){
                let is_number = typeof idx === 'number';
                if(typeof idx === 'number'){
                    if(idx<0){
                        if(blocks.length<=1){
                            idx = 0;
                        }else if(idx==-1){
                            idx = await this.ea.dialog_suggest(
                                blocks.map(x=>x.split('\n').slice(1,-1).join('\n').trim().split('\n')[0]),
                                this.ea.editor.range(blocks.length),
                                '选择脚本', 
                                false
                            );
                            if(idx==null){
                                return '';
                            }
                            idx = idx as number;
                        }else{
                            idx = await this.ea.dialog_multi_suggest(
                                blocks.map(x=>x.split('\n').slice(1,-1).join('\n').trim().split('\n')[0]), 
                                this.ea.editor.range(blocks.length),
                                '',
                                '选择脚本'
                            );
                            if(idx==null){
                                return '';
                            }
                            idx = idx as number[];
                        }
                    }
                    if(typeof idx === 'number'){
                        idx = [idx];
                    }
                }
                for(let i of idx){
                    let block = blocks[i];
                    if(block){
                        let item = await templateFunc(block);
                        res.push(item);
                    }else{
                        res.push('');
                    }
                }
                if(is_number){
                    return res[0];
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