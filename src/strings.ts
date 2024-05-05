

export class Strings{
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
            return 'Reset note chain by LongForm.';
        }
    }

    get cmd_longform4notechain(){
        if(this.language=='zh'){
            return '根据笔记链条，重置LongForm场景'
        }else{
            return "Reset LongForm scenes by note chain.";
        }
    }

    get cmd_sort_file_explorer(){
        if(this.language=='zh'){
            return '根据笔记链排序'
        }else{
            return "Sort file explorer by note chain.";
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
            return '插入节点'
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
            return "Sort by chain in File Explorer ?";
        }
    }

    get setting_isFolderFirst(){
        if(this.language=='zh'){
            return '排序时目录时文件夹优先？'
        }else{
            return "Sort folder first in file explorer?";
        }
    }

    get setting_PrevChain(){
        if(this.language=='zh'){
            return '前置笔记数量？'
        }else{
            return "Number of prev notes to show?";
        }
    }

    get setting_NextChain(){
        if(this.language=='zh'){
            return '后置笔记数量？'
        }else{
            return "Number of next notes to show?";
        }
    }

    get setting_suggesterNotesMode(){
        if(this.language=='zh'){
            return `${this.chain_insert_node}：默认模式`
        }else{
            return `${this.chain_insert_node}:Default mode`
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
            return "Refresh tasks while open new file?";
        }
    }

    
    get item_insert_suggester(){
        if(this.language=='zh'){
            return '插入模式（相对于锚点）'
        }else{
            return "Insert mode(relate to anchor).";
        }
    }

    get item_insert_node_after(){
        if(this.language=='zh'){
            return '后置笔记'
        }else{
            return "Next note";
        }
    }

    get item_insert_node_before(){
        if(this.language=='zh'){
            return '前置笔记'
        }else{
            return "Prev note";
        }
    }

    get item_insert_node_as_head(){
        if(this.language=='zh'){
            return '链头'
        }else{
            return "Head of chain";
        }
    }

    get item_insert_node_as_tail(){
        if(this.language=='zh'){
            return '链尾'
        }else{
            return "Tail of thain";
        }
    }

    get item_insert_folder_after(){
        if(this.language=='zh'){
            return '文件夹后置'
        }else{
            return "Folder as next";
        }
    }

    get item_get_brothers(){
        if(this.language=='zh'){
            return '同级笔记'
        }else{
            return "Notes in same folder";
        }
    }

    get item_same_folder(){
        if(this.language=='zh'){
            return '同级笔记+子目录'
        }else{
            return "Notes in same folder(recursive)";
        }
    }

    get item_inlinks_outlinks(){
        if(this.language=='zh'){
            return '出链+入链'
        }else{
            return "OutLinks + InLinks";
        }
    }

    get item_inlins(){
        if(this.language=='zh'){
            return '入链'
        }else{
            return "Inlinks";
        }
    }

    get item_outlinks(){
        if(this.language=='zh'){
            return '出链'
        }else{
            return "Outlinks";
        }
    }

    get item_all_noes(){
        if(this.language=='zh'){
            return '所有笔记'
        }else{
            return "All notes";
        }
    }

    get item_recent(){
        if(this.language=='zh'){
            return '近期笔记（基于插件：recent-files-obsidian）'
        }else{
            return "Recent (Based on recent files plugin)";
        }
    }

    get item_uncle_notes(){
        if(this.language=='zh'){
            return '上级笔记'
        }else{
            return "Notes in grandpa folder";
        }
    }

    get item_notechain(){
        if(this.language=='zh'){
            return '笔记链条'
        }else{
            return "Note chain";
        }
    }

    get item_currentnote(){
        if(this.language=='zh'){
            return '当前笔记'
        }else{
            return "Current note";
        }
    }

    get item_chain_insert_node_after():string{
        if(this.language=='zh'){
            return '添加后置笔记'
        }else{
            return "Create next note";
        }
    }

    get item_chain_insert_node_as_tail():string{
        if(this.language=='zh'){
            return '链尾添加笔记'
        }else{
            return "Create tail note";
        }
    }

    get item_chain_insert_node_before():string{
        if(this.language=='zh'){
            return '添加前置笔记'
        }else{
            return "Create prev note";
        }
    }

    get item_chain_insert_node_as_head():string{
        if(this.language=='zh'){
            return '链头添加笔记'
        }else{
            return "Create head note";
        }
    }

    get item_item_chain_insert_null():string{
        if(this.language=='zh'){
            return '无链接'
        }else{
            return "Create note not in chain";
        }
    }

    get prompt_notename():string{
        if(this.language=='zh'){
            return '输入笔记名'
        }else{
            return "Input note name";
        }
    }

}


export let strings = new Strings();