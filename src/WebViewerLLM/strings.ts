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

    get cmd_refresh_llms(){
        if(this.language=='zh'){
            return 'WebviewLLM: 刷新AI模型列表'
        }else{
            return 'WebviewLLM: Refresh AI Models'
        }
    }

    get cmd_open_new_llm(){
        if(this.language=='zh'){
            return 'WebviewLLM: 新建AI对话'
        }else{
            return 'WebviewLLM: New AI Chat'
        }
    }

    get cmd_chat_sequence(){
        if(this.language=='zh'){
            return 'WebviewLLM: 开始连续对话'
        }else{
            return 'WebviewLLM: Start Continuous Chat'
        }
    }

    get cmd_chat_sequence_stop(){
        if(this.language=='zh'){
            return 'WebviewLLM: 停止连续对话'
        }else{
            return 'WebviewLLM: Stop Continuous Chat'
        }
    }

    get cmd_paste_last_active_llm(){
        if(this.language=='zh'){
            return 'WebviewLLM: 粘贴上次激活的AI模型内容'
        }else{
            return 'WebviewLLM: Paste Last Active AI Model Content'
        }
    }

    get cmd_chat_with_target_tfile(){
        if(this.language=='zh'){
            return 'WebviewLLM: 与目标文件对话'
        }else{
            return 'WebviewLLM: Chat with Target File'
        }
    }

    get cmd_paste_ai_contents_as_list2card(){
        if(this.language=='zh'){
            return 'WebviewLLM: 将AI内容粘贴为卡片'
        }else{
            return 'WebviewLLM: Paste AI content to card list'
        }
    }

    get cmd_paste_ai_contents_as_list2tab(){
        if(this.language=='zh'){
            return 'WebviewLLM: 将AI内容粘贴为标签页'
        }else{
            return 'WebviewLLM: Paste AI content to tab list'
        }
    }

    get setting_prompt_name(){
        if(this.language=='zh'){
            return '提示词名称（用于标题或代码块）'
        }else{
            return 'Prompt Name (for heading or code block)'
        }
    }
    get setting_auto_stop(){
        if(this.language=='zh'){
            return '当AI返回以下文本时自动结束对话'
        }else{
            return 'Auto-stop chat when AI responds with'
        }
    }
    
    get setting_turndown_styles(){
        if(this.language=='zh'){
            return 'HTML 转 Markdown 样式'
        }else{
            return 'HTML to Markdown Styles'
        }
    }

    get cmd_chat_every_llms(){
        if(this.language=='zh'){
            return '向所有AI模型发送消息'
        }else{
            return 'Send Message to All AI Models'
        }
    }

    get cmd_chat_first_llms(){
        if(this.language=='zh'){
            return '向首个AI模型发送消息'
        }else{
            return 'Send Message to First AI Model'
        }
    }

    /** 设置页 Tab 标签 */
    get settings_tab_label(){
        if(this.language=='zh'){
            return '网页 AI'
        }else{
            return 'WebViewer LLM'
        }
    }
}

export let strings = new Strings();