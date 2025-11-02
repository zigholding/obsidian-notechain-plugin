

import { App, View, WorkspaceLeaf } from 'obsidian';

import {dialog_suggest} from './gui/inputSuggester'
import {dialog_prompt} from './gui/inputPrompt'
import {EasyEditor } from './editor';
import {File } from './file';
import {Random } from './random';
import { Waiter } from './waiter';
import { Templater } from './templater';
import {Time} from './time'
import { Web } from './web';

export class EasyAPI {
    app: App;
    dialog_suggest: Function
	dialog_prompt: Function
    editor: EasyEditor
    file: File
    random: Random
    waiter: Waiter
    tpl: Templater
    time: Time
    web: Web

    constructor(app: App) {
        this.app = app;
        this.dialog_suggest = dialog_suggest;
		this.dialog_prompt = dialog_prompt;
        this.editor = new EasyEditor(app,this);
        this.file = new File(app,this);
        this.waiter = new Waiter(app,this);
        this.random = new Random(app,this);
        this.tpl = new Templater(app,this);
        this.time = new Time(app,this);
        this.web = new Web(app);
    }

    get_plugin(name:string){
        return (this.app as any).plugins?.plugins[name]
    }
    
    get ea(){
        return this.get_plugin('easyapi');
    }

    get nc(){
        return this.get_plugin('note-chain');
    }

    get ns(){
        return this.get_plugin('note-sync');
    }

    get wv(){
        return this.get_plugin('webview-llm');
    }

    get qa(){
        return this.get_plugin('quickadd')?.api;
    }

    get dv(){
        return this.get_plugin('dataview')?.api;
    }

    get cfile(){
        return this.app.workspace.getActiveFile();
    }

    get cmeta(){
        let cfile = this.cfile;
        if(cfile){
            return this.app.metadataCache.getFileCache(cfile)
        }
    }

    get cfm(){
        let cmeta = this.cmeta;
        if(cmeta){
            return cmeta.frontmatter;
        }
    }

    get ccontent(){
        let cfile = this.cfile;
        if(cfile){
            return this.app.vault.read(cfile);
        }
    }

    get cfolder(){
        return this.cfile?.parent;
    }

    get cview(){
        let view = (this.app.workspace as any).getActiveFileView()
		return view;
    }

    get ceditor(){
        let editor = this.cview?.editor;
        return editor;
    }
}