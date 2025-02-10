import { time } from 'console';
import { 
    App, Editor, MarkdownView, Modal, Notice, 
    Plugin, PluginSettingTab, Setting,
    TFile, TFolder, moment, EditorPosition, EditorSelection
} from 'obsidian';
import NoteChainPlugin from "../main";
import * as internal from 'stream';


export class WordCount{
	app:App;
    plugin:NoteChainPlugin;
	nretry:number;
    timerId:NodeJS.Timeout;
    curr_active_file:TFile;
    events: Array<object>;

	constructor(plugin:NoteChainPlugin,app:App){
        this.plugin = plugin;
		this.app = app;
		this.nretry=100;
        this.events = new Array();
        this.register();   
	}

    filter(tfile:TFile){
        if(!tfile){return false;}
        if((tfile as any).deleted){return false;}
        if(tfile.extension!='md'){return false;}
        let xfolders = this.plugin.settings.wordcountxfolder.split('\n').filter(x=>x!='');
        for(let item of xfolders){
            if(tfile.path.startsWith(item)){
                return false;
            }else if(item=='/'){
                if(tfile.parent?.path=='/'){
                    return false;
                }
            }
        }
        return true;
    }

    // 统计字数
    count_words(ctx:string,ignore=/[\s!"#$%&'()*+,./:;<=>?@[\]^_`{|}，。！？【】、；：“”‘’《》（）［］—…￥]/g){
        let N = ctx.replace(ignore, '').length;
        let enregex = /[a-zA-Z0-9-]+/g;
        let matches = ctx.match(enregex);
        if(matches){
            let elen=0;
            matches.forEach(x=>elen=elen+x.length);
            N = N-elen+matches.length;
        }
        return N;
    }

    async set_mtime_value(tfile:TFile,key:string,val:number){

        let activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        let editorState: {
            cursor?: EditorPosition,
            selection?: string,
            sanchor?:EditorPosition,
            shead?:EditorPosition,
            scrollInfo?: { left: number, top: number }
        } = {};
    
        if (activeView && activeView.file === tfile) {
            let editor = activeView.editor;
            if (editor) {
                editorState.cursor = editor.getCursor();
                editorState.selection = editor.getSelection();
                editorState.sanchor = editor.getCursor('anchor');
                editorState.shead = editor.getCursor('head');
                editorState.scrollInfo = editor.getScrollInfo();
            }
        }
        let aline = editorState?.cursor?.line !== undefined
            ? activeView?.editor?.getLine(editorState.cursor.line)
            : undefined;
        if(aline && aline.startsWith('|') && aline.endsWith('|')){
            return;
        }
        await this.app.fileManager.processFrontMatter(
            tfile,
            (fm) =>{
                let t = moment.unix(tfile.stat.mtime/1000);
                let mtime = t.format('YYYY-MM-DD');
                if(fm[key]==null){
                    if(val>0){
                        fm[key] = {};
                        if(mtime== moment().format('YYYY-MM-DD') && mtime!=moment.unix(tfile.stat.ctime/1000).format('YYYY-MM-DD')){
                            fm[key][t.add(-1,'days').format('YYYY-MM-DD')] = val;
                        }else{
                            fm[key][mtime] = val;
                        }
                    }
                }else{
                    let ts = Object.keys(fm[key]).sort((b,a)=>a.localeCompare(b)).filter(x=>!(x==mtime));
                    if(ts.length==0){
                        if(val>0){
                            fm[key][mtime] = val;
                        }else if(fm[key][mtime]){
                            fm[key][mtime] = val;
                        }
                    }else{
                        if((val-fm[key][ts[0]])!=0){
                            fm[key][mtime] = val;
                        }else if(fm[key][mtime]){
                            delete fm[key][mtime];
                        }
                    }
                }
            }
        )
        // Restore editor state if it was saved
        if (activeView && activeView.file === tfile) {
            let editor = activeView.editor;
            if (editor) {
                if (editorState.selection && editorState.sanchor && editorState.shead) {
                    try {
                        await editor.setSelection(editorState.sanchor,editorState.shead);
                    } catch (error) {
                        new Notice(`Error setting selection:${error}`,3000);
                    }
                }else if (editorState.cursor) {
                    await editor.setCursor(editorState.cursor);
                }
                if (editorState.scrollInfo) {
                    await editor.scrollTo(editorState.scrollInfo.left, editorState.scrollInfo.top);
                }
            }
        }
    }

    get_new_words(tfile:TFile,day=moment().format('YYYY-MM-DD')){
        let meta = this.app.metadataCache.getFileCache(tfile);
        let values = meta?.frontmatter?.words;
        if(values){
            let keys = Object.keys(values).sort((a,b)=>a.localeCompare(b));
            let idx = keys.indexOf(day);
            if(idx<0){
                return 0;
            }else if(idx==0){
                return values[day];
            }else{
                return values[day]-values[keys[idx-1]];
            }
        }

    }

    async update_word_count(tfile:TFile){
        if(!this.filter(tfile)){return;}
        let ctx = await this.app.vault.cachedRead(tfile);
        let mcache = this.app.metadataCache.getFileCache(tfile)
        if(mcache?.frontmatterPosition){
            ctx = ctx.slice(mcache.frontmatterPosition.end.offset)
        }
        let N = this.count_words(ctx);
        await this.set_mtime_value(tfile,'words',N);
    }

	check_frontmatter(tfile:TFile,kv:{[key:string]:any}):boolean{
		try {
			if(!tfile){return false;}
			let meta = this.app.metadataCache.getFileCache(tfile);
			if(meta?.frontmatter){
				for(let k in kv){
					if(!(meta.frontmatter[k]==kv[k])){
						return false;
					}
				}
				return true;
			}
			return false;
		} catch (error) {
			return false;
		}
	}

	async wait_frontmatter(tfile:TFile,kv:{[key:string]:any},nretry=this.nretry):Promise<boolean>{
		let flag = this.check_frontmatter(tfile,kv);
		
		while(!flag && nretry>0){
			await sleep(50);
			nretry = nretry-1;
			flag = this.check_frontmatter(tfile,kv);
		}
		return flag;
	}

    async update_word_count_of_vault(){
        let tfiles = this.app.vault.getMarkdownFiles().filter((x:TFile)=>this.filter(x));
        let i = 0;
        for(let tfile of tfiles){
            new Notice(`${i}/${tfiles.length}:${tfile.name}`,3000);
            await this.update_word_count(tfile);
            i = i+1;
        }
    }

    register(){
		if(this.plugin.settings.wordcout){
			this.regeister_editor_change();
			this.regeister_active_leaf_change();
		}else{
            this.unregister();
        }
    }

    regeister_editor_change(){    
        let e = this.app.workspace.on('editor-change',async (editor,info)=>{
            if(info.file?.extension!='md'){
                return;
            }
            if(this.timerId!==null){
                clearTimeout(this.timerId);
            }
            if(info.file){
                this.timerId = setTimeout(()=>{
                    this.update_word_count((info as any).file);
                }, 3000);
            }
        });
        this.plugin.registerEvent(e);
        this.events.push(e);
    }

    regeister_active_leaf_change(){
        let e = this.app.workspace.on('active-leaf-change',async (leaf)=>{

            let tfile = (leaf?.view as any).file;
            if(!leaf?.view){
                return;
            }
            if(!((leaf.view as any)?.file?.extension=='md')){
                return;
            }
            await this.update_word_count(tfile);
            if(this.curr_active_file==null){
                this.curr_active_file = tfile;
                return;
            }
            if(this.curr_active_file != tfile){
                await this.update_word_count(this.curr_active_file);
                this.curr_active_file = tfile;
            }
        });
        this.plugin.registerEvent(e);
        this.events.push(e);
    }

    unregister(){
        for(let e of this.events){
            (e as any).e.offref(e)
        }
        this.events = this.events.slice(-1,0);
    }

    get_words_of_tfiles(files:Array<TFile>|null=null){
        if(!files){
            files = this.plugin.chain.get_all_tfiles();
        }
        return files.map(
            x=>this.plugin.editor.get_frontmatter(x,'words')
        ).filter(x=>x);
    }

    sum_words_of_tifles(files:Array<TFile>|null=null, begt:number|string=10, endt:number|string=0) {
        files = this.get_words_of_tfiles(files)
        if(typeof(begt)=='number'){
            begt = moment().add(-begt,'days').format('YYYY-MM-DD')
        }
        if(typeof(endt)=='number'){
            endt = moment().add(-endt,'days').format('YYYY-MM-DD')
        }
        
        let startDate = new Date(begt);
        let endDate = new Date(endt);
        let dailyWordCounts:{[key:string]:any} = {};
    
        // Initialize dailyWordCounts with all dates in the range
        for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
            let dateStr = date.toISOString().split('T')[0];
            dailyWordCounts[dateStr] = 0;
        }
        
        // Sum up the word counts for each date
        files.forEach((file:any) => {
            let lastWordCount = 0;
            let earliestDate = new Date(Object.keys(file).sort()[0]);
    
            // Initialize lastWordCount with the earliest date's word count in the file
            if (earliestDate < startDate) {
                lastWordCount = file[earliestDate.toISOString().split('T')[0]];
            }
            
            for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
                let dateStr = date.toISOString().split('T')[0];
                if (file.hasOwnProperty(dateStr)) {
                    lastWordCount = file[dateStr];
                }
                dailyWordCounts[dateStr] += lastWordCount;
            }
        });
        return dailyWordCounts;
    }

    diff_words_of_tifles(dailyWordCounts: { [key: string]: number }, first_as_zero: boolean = true): { [key: string]: number } {
        let dailyNewWordCounts: { [key: string]: number } = {};
        let previousTotal = 0;
        let first = '';
    
        for (let date in dailyWordCounts) {
            if (first === '') {
                first = date;
            }
            let currentTotal = dailyWordCounts[date];
            dailyNewWordCounts[date] = currentTotal - previousTotal;
            previousTotal = currentTotal;
        }
    
        if (first_as_zero && first !== '') {
            dailyNewWordCounts[first] = 0;
        }
    
        return dailyNewWordCounts;
    }
}