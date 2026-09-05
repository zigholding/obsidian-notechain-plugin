

import { App, Plugin, View, WorkspaceLeaf, TFile } from 'obsidian';

import {dialog_suggest} from './gui/inputSuggester'
import { dialog_multi_suggest } from './gui/inputMultiSuggester'
import { dialog_prompt } from './gui/inputPrompt'
import { dialog_markdown_prompt } from './gui/markdownPrompt'
import {selectColor} from './gui/selectColor'
import { openCardNavigator, type CardItem } from './gui/inputCardSuggester'
import { openCalendarGallery } from './gui/calendarGalleryModal'
import { exitLightbox } from './gui/mediaLightbox'
import {EasyEditor } from './editor';
import {File } from './file';
import {Random } from './random';
import { Waiter } from './waiter';
import { Templater } from './templater';
import {Time} from './time'
import { Web } from './web';
import { FsEditor } from './fseditor';
import { activeFileView, isMobileApp, noteChainPlugin, obsidianApp } from '../obsidian-app';
import type NoteChainPlugin from '../plugin';

export class EasyAPI {
    app: App;
    dialog_suggest: typeof dialog_suggest
	dialog_multi_suggest: typeof dialog_multi_suggest
	dialog_prompt: typeof dialog_prompt
	dialog_markdown_prompt: typeof dialog_markdown_prompt
    dialog_cards: typeof openCardNavigator
    dialog_calendar: typeof openCalendarGallery
    dialog_color: typeof selectColor
    exit_lightbox: typeof exitLightbox
    editor: EasyEditor
    file: File
    random: Random
    waiter: Waiter
    tpl: Templater
    time: Time
    web: Web
    fs: FsEditor

    constructor(app: App) {
        this.app = app;
        this.dialog_suggest = dialog_suggest;
		this.dialog_multi_suggest = dialog_multi_suggest;
		this.dialog_prompt = dialog_prompt;
		this.dialog_markdown_prompt = dialog_markdown_prompt;
		this.dialog_cards = openCardNavigator;
		this.dialog_calendar = openCalendarGallery;
        this.dialog_color = selectColor;
		this.exit_lightbox = exitLightbox;
        this.editor = new EasyEditor(app,this);
        this.file = new File(app,this);
        this.waiter = new Waiter(app,this);
        this.random = new Random(app,this);
        this.tpl = new Templater(app,this);
        this.time = new Time(app,this);
        this.web = new Web(app);
        this.fs = new FsEditor(app,this);
        window.ea = this;
    }

    get_plugin<T extends Plugin = Plugin>(name: string): T | undefined {
        return obsidianApp(this.app).plugins?.plugins[name] as T | undefined;
    }
    
    get nc(): NoteChainPlugin | undefined {
        return noteChainPlugin(this.app);
    }

    get ns(){
        return this.get_plugin('note-sync');
    }

    get wv(){
        return this.nc?.webviewerllm;
    }

    get qa(){
        return (this.get_plugin('quickadd') as { api?: unknown } | undefined)?.api;
    }

    get dv(){
        return (this.get_plugin('dataview') as { api?: unknown } | undefined)?.api;
    }

    get dc(): { query: (q: string) => Array<{ $path?: string }> } | undefined {
        const api = (this.get_plugin('datacore') as { api?: { query?: (q: string) => unknown } } | undefined)?.api;
        if (!api) {
            return undefined;
        }
        const queryFn = api.query;
        if (typeof queryFn !== 'function') {
            return undefined;
        }
        return {
            query: (q: string) => {
                const data = queryFn(q);
                return Array.isArray(data) ? data as Array<{ $path?: string }> : [];
            },
        };
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
        let view = activeFileView(this.app)
		return view;
    }

    get ceditor(){
        let editor = this.cview?.editor;
        return editor;
    }

    get isMobile(){
        return isMobileApp(this.app);
    }

    get isZh(){
        return window.localStorage.getItem('language') == 'zh';
    }
}

