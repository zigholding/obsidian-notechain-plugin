

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

    get cmd_mermaid_flowchart_link(){
        if(this.language=='zh'){
            return 'Mermaid链接卡片'
        }else{
            return 'Mermaid of linked notes';
        }
    }

    get cmd_mermaid_flowchart_folder(){
        if(this.language=='zh'){
            return 'Mermaid目录卡片'
        }else{
            return 'Mermaid of folder notes';
        }
    }

    get cmd_mermaid_flowchart_auto(){
        if(this.language=='zh'){
            return 'Mermaid卡片'
        }else{
            return 'Mermaid of notes';
        }
    }


    get cmd_file_open_with_system_app(){
        if(this.language=='zh'){
            return '文件 - 使用系统程序打开（仅桌面）'
        }else{
            return 'File - open with system app (desktop only)';
        }
    }

    get cmd_file_show_in_system_explorer(){
        if(this.language=='zh'){
            return '文件 - 在系统浏览的查看（仅桌面）'
        }else{
            return 'File - show in system explorer (desktop only)';
        }
    }

    get cmd_file_rename(){
        if(this.language=='zh'){
            return '文件 - 重命名文件'
        }else{
            return 'File - rename file';
        }
    }


    get cmd_longform2notechain(){
        if(this.language=='zh'){
            return '根据LongForm重置笔记链条'
        }else{
            return 'Reset note chain by longform';
        }
    }

    get cmd_longform4notechain(){
        if(this.language=='zh'){
            return '根据笔记链条，重置LongForm场景'
        }else{
            return "Reset longform scenes by note chain";
        }
    }

    get cmd_sort_file_explorer(){
        if(this.language=='zh'){
            return '根据笔记链排序'
        }else{
            return "Sort file explorer by note chain";
        }
    }

    get cmd_open_notes_smarter(){
        if(this.language=='zh'){
            return '智能打开文件'
        }else{
            return "Open note smarter";
        }
    }

    get cmd_open_note(){
        if(this.language=='zh'){
            return '打开文件'
        }else{
            return "Open note";
        }
    }

    get cmd_open_prev_note(){
        if(this.language=='zh'){
            return '打开前置笔记'
        }else{
            return "Open prev note";
        }
    }

    get chain_move_up_node(){
        if(this.language=='zh'){
            return '打开前置笔记'
        }else{
            return "Move node up";
        }
    }

    get chain_move_down_node(){
        if(this.language=='zh'){
            return '打开前置笔记'
        }else{
            return "Move node down";
        }
    }

    get cmd_open_next_note(){
        if(this.language=='zh'){
            return '打开后置笔记'
        }else{
            return "Open next note";
        }
    }

    get cmd_reveal_note(){
        if(this.language=='zh'){
            return '定位当前笔记'
        }else{
            return "Reveal current file in navigation";
        }
    }

    get cmd_open_and_reveal_note(){
        if(this.language=='zh'){
            return '打开并定位笔记'
        }else{
            return "Open and reveal note";
        }
    }

    get cmd_open_prev_note_of_right_leaf(){
        if(this.language=='zh'){
            return '右侧页面打开前置笔记'
        }else{
            return "Open prev note of right leaf";
        }
    }

    get cmd_open_next_note_of_right_leaf(){
        if(this.language=='zh'){
            return '右侧页面打开后置笔记'
        }else{
            return "Open next note of right leaf";
        }
    }

    get cmd_execute_template_modal(){
        if(this.language=='zh'){
            return '执行脚本笔记'
        }else{
            return "Execute Templater modal";
        }
    }

    get cmd_toogle_css_block_in_note(){
        if(this.language=='zh'){
            return '启用/关闭 css 代码块'
        }else{
            return "Toogle css block in note";
        }
    }
    
    get cmd_set_frontmatter(){
        if(this.language=='zh'){
            return '所选笔记设置属性'
        }else{
            return "Set fronmatter for selected notes";
        }
    }


    get filemenu_create_next_note(){
        if(this.language=='zh'){
            return '创建后置笔记'
        }else{
            return "Create next note";
        }
    }

    get filemenu_move_as_next_note(){
        if(this.language=='zh'){
            return '移动为后置笔记'
        }else{
            return "Move as next note";
        }
    }

    get filemenu_move_as_next_notes(){
        if(this.language=='zh'){
            return '移动为后置笔记（选中笔记）'
        }else{
            return "Move as next notes(selected)";
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
            return '重塑当前文件夹笔记链条'
        }else{
            return "Rebuild the chain of current folder";
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
            return "Sort by chain in file explorer?";
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

    get setting_auto_notechain(){
        if(this.language=='zh'){
            return '打开文件时，自动重塑文件夹笔记链？'
        }else{
            return "Auto build notechain of folder while open new file?";
        }
    }

    get setting_refreshDataView(){
        if(this.language=='zh'){
            return '打开文件时，刷新Dataview视图？'
        }else{
            return "Refresh dataview while open new file?";
        }
    }

    get setting_refreshTasks(){
        if(this.language=='zh'){
            return '打开文件时，刷新Tasks视图？'
        }else{
            return "Refresh tasks while open new file?";
        }
    }

    get setting_wordcout(){
        if(this.language=='zh'){
            return '统计每日字数'
        }else{
            return "Register daily word count?";
        }
    }
    
    get setting_avata(){
        if(this.language=='zh'){
            return '头像'
        }else{
            return "Avata";
        }
    }
    

    get setting_wordcout_xfolder(){
        if(this.language=='zh'){
            return '跳过以下目录'
        }else{
            return "Ignore these folders";
        }
    }

    get setting_notice_while_modify_chain(){
        if(this.language=='zh'){
            return '修改笔记链时显示通知？'
        }else{
            return "Notice while modify note chain?";
        }
    }


    get setting_field_of_display_text(){
        if(this.language=='zh'){
            return '文件列表显示文件名'
        }else{
            return "Display text for notes in file-explorer?";
        }
    }

    get setting_field_of_background_color(){
        if(this.language=='zh'){
            return '文件列表元素风格'
        }else{
            return "File-item style for notes in file-explorer?";
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
            return "outLinks + inLinks";
        }
    }

    get item_inlins(){
        if(this.language=='zh'){
            return '入链'
        }else{
            return "inlinks";
        }
    }

    get item_outlinks(){
        if(this.language=='zh'){
            return '出链'
        }else{
            return "outlinks";
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
            return '近期笔记'
        }else{
            return "Recent";
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