

export class LangString{
    language:string;
    constructor(){
        let lang = window.localStorage.getItem('language');
        if(lang){
            this.language = lang;
        }else{
            this.language = 'en';
        }
	}

    get cmd_longform2notechain(){
        if(this.language=='zh'){
            return '根据LongForm重置笔记链条'
        }else{
            return 'Reset Note Chain by LongForm.';
        }
    }

    get cmd_longform4notechain(){
        if(this.language=='zh'){
            return '根据笔记链条，重置LongForm场景'
        }else{
            return "Reset LongForm Secnes by Note Chain.";
        }
    }

    get cmd_sort_file_explorer(){
        if(this.language=='zh'){
            return '根据笔记链排序'
        }else{
            return "Sort File Explorer by Note Chain.";
        }
    }

    get cmd_open_notes_smarter(){
        if(this.language=='zh'){
            return '智能打开文件'
        }else{
            return "Open note smarter.";
        }
    }

    get cmd_open_note(){
        if(this.language=='zh'){
            return '打开文件'
        }else{
            return "Open note.";
        }
    }

    get cmd_open_prev_notes(){
        if(this.language=='zh'){
            return '打开前置笔记'
        }else{
            return "Open prev note.";
        }
    }

    get cmd_open_next_notes(){
        if(this.language=='zh'){
            return '打开后置笔记'
        }else{
            return "Open next note.";
        }
    }

    get clear_inlinks(){
        if(this.language=='zh'){
            return '清理笔记入链'
        }else{
            return 'Clear inlinks of current file';
        }
    }

    get move_file_to_another_folder(){
        if(this.language=='zh'){
            return '移动当前文件'
        }else{
            return "Move current file to another folder";
        }
    }

    get replace_notes_with_regx(){
        if(this.language=='zh'){
            return '正则表达式替换笔记内容'
        }else{
            return "Replace by regex";
        }
    }

    get chain_insert_node(){
        if(this.language=='zh'){
            return '当前笔记插入节点'
        }else{
            return "Insert node of chain";
        }
    }

    get chain_set_seq_note(){
        if(this.language=='zh'){
            return '重置当前文件夹笔记链条'
        }else{
            return "Reset the chain of current folder!";
        }
    }

    get create_new_note(){
        if(this.language=='zh'){
            return '创建新笔记'
        }else{
            return "Create new note";
        }
    }

    get setting_isSortFileExplorer(){
        if(this.language=='zh'){
            return '根据笔记链条排序目录'
        }else{
            return "Sort File Explorer by Chain?";
        }
    }

    get setting_isFolderFirst(){
        if(this.language=='zh'){
            return '排序时目录时文件夹优先？'
        }else{
            return "Sort File Explorer Folder First?";
        }
    }

    get setting_PrevChain(){
        if(this.language=='zh'){
            return '前置笔记数量？'
        }else{
            return "Number of Prev Notes to show?";
        }
    }

    get setting_NextChain(){
        if(this.language=='zh'){
            return '后置笔记数量？'
        }else{
            return "Number of Next Notes to show?";
        }
    }

    get setting_refreshDataView(){
        if(this.language=='zh'){
            return '打开文件时刷新Dataview视图？'
        }else{
            return "Refresh Dataview while open new file?";
        }
    }

    get setting_refreshTasks(){
        if(this.language=='zh'){
            return '打开文件时刷新Tasks视图？'
        }else{
            return "Refresh Tasks while open new file?";
        }
    }

    
}


