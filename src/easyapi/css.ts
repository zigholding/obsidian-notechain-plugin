


import { App, View, WorkspaceLeaf,TFile,TFolder } from 'obsidian';

import {EasyAPI} from 'src/easyapi/easyapi'

export class CSS {
    app: App;
    ea: EasyAPI;

    constructor(app: App, api:EasyAPI) {
        this.app = app;
        this.ea = api;
    }
    
    async toogle_note_css(document:any,name:string,refresh=false) {
        let tfile = this.ea.file.get_tfile(name);
        if(!tfile){return}

        let link = document.getElementById(tfile.basename);
        if(link && refresh){
            link.remove()
        }else{
            let css = await this.ea.editor.extract_code_block(tfile,'css')
            let inner = css.join('\n')
            if(link){
                link.innerHTML = inner
            }else{
                if(inner!=''){
                    let styleElement = document.createElement('style')
                    styleElement.innerHTML=inner;
                    styleElement.id = tfile.basename;
                    document.head.appendChild(styleElement);
                }
            }
        }
    }
}

