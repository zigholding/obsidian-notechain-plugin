import { App,Notice } from 'obsidian';

import { BaseWebViewer } from './BaseWebViewer';

export class Yuanbao extends BaseWebViewer {
    constructor(app: App,homepage='https://yuanbao.tencent.com/chat') {
		super(app, homepage,'元宝');
	}
	
	async new_chat(){
		let msg = await (this.view as any).webview.executeJavaScript(
			`
			document.querySelector('.yb-common-nav__new-chat').click()
			`
		)
		return msg;
	}

	async paste_msg(ctx:string) {
		let msg;
		ctx = this.get_safe_ctx(ctx);
		const maxRetries = 1; // 最大重试次数
		for (let attempt = 0; attempt < maxRetries; attempt++) {
			msg = await this.webview.executeJavaScript(
				`
				function delay(ms) {
					return new Promise(resolve => {
					setTimeout(resolve, ms);
					});
				}

				// 将异步逻辑封装到一个 async 函数中
				async function insertTextAndSend(ctx) {
					// 获取 textarea 并聚焦
					
					let item = document.querySelector('.chat-input-editor  .ql-editor.ql-blank');
					item.focus();

					// 插入文本
					setTimeout(() => {
						document.execCommand('insertText', false, ctx);
					}, 1000);
					let i = 100;
					// 等待按钮可点击
					while (true) {
						let item = document.querySelector('.chat-input-editor').querySelector('.ql-editor.ql-blank')
						if(item){
							await delay(100);
						}else{
							break;
						}
						i = i-1;
						if(i<0){break}
					}
				}

				// 调用 async 函数
				insertTextAndSend(\`${ctx}\`);
				`
			);
			// 检查是否成功粘贴
			if (msg) {
				break; // 如果成功，退出重试循环
			}
			await this.delay(1000); // 等待一段时间后重试
		}
		
		return msg;
	}

	async click_btn_of_send() {
		let msg = await this.webview.executeJavaScript(
			`
			function delay(ms) {
				return new Promise(resolve => {
					setTimeout(resolve, ms);
				});
			}
			async function click(){
				let button = document.querySelector('a[class^="style__send-btn"]');
				while(!button){
					await delay(100);
					button = document.querySelector('a[class^="style__send-btn"]');
				}
				button.click();
			}
			click();
			`
		)
		return msg;
	}

	async number_of_receive_msg(){
		let msg = await this.webview.executeJavaScript(
			`
			function number_of_receive_msg(){
				let items = document.querySelectorAll('.hyc-content-md .hyc-common-markdown');
				items = Array.from(items).filter(item => {
					return item.closest('.hyc-component-reasoner__think-content') == null;
				});
				
				if(items.length==0){return 0}
				
				let N = items.length;
				let v = items[items.length-1]
				if(!v){return 0}
				v = v.closest('.agent-chat__list__item__content');
				v = v.querySelector('.agent-chat__toolbar__copy__icon');
				if(!v){
					N = N-1;
				}
				return N;
			}
			number_of_receive_msg()
			`
		)
		return msg;
	}

	async get_last_content(){
		let doc = await this.document();
		let items = Array.from(doc.querySelectorAll('.hyc-content-md .hyc-common-markdown')).filter(
			el => !el.parentElement?.parentElement?.classList.contains('hyc-component-reasoner__think-content')
		);
		let ctx = this.html_to_markdown(items[items.length-1].outerHTML);
		return ctx;
	}

}
