

import { App, View, WorkspaceLeaf } from 'obsidian';

import {dialog_suggest} from './gui/inputSuggester'
import {dialog_prompt} from './gui/inputPrompt'
import { EasyEditor } from './editor';
import { File } from './file';

export class EasyAPI {
    app: App;
    dialog_suggest: Function
	dialog_prompt: Function
    editor: EasyEditor
    file: File

    constructor(app: App) {
        this.app = app;
        this.dialog_suggest = dialog_suggest;
		this.dialog_prompt = dialog_prompt;
        this.editor = new EasyEditor(app,this);
        this.file = new File(app,this);
    }

    get_plugin(name:string){
        return (this.app as any).plugins?.plugins[name]
    }

    get nc(){
        return this.get_plugin('note-chain');
    }

    get cfile(){
        return this.app.workspace.getActiveFile();
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