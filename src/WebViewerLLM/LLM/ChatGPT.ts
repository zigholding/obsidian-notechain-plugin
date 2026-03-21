import { App, Notice } from 'obsidian';

import { BaseWebViewer } from './BaseWebViewer';

export class ChatGPT extends BaseWebViewer {
	constructor(app: App, homepage = 'https://chatgpt.com') {
		super(app, homepage, 'ChatGPT');
	}

	async new_chat() {
		let msg = await (this.view as any).webview.executeJavaScript(
			`
			document.querySelector('a[data-testid="create-new-chat-button"]').click()
			`
		)
		return msg;
	}

	async paste_msg(ctx: string) {
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
					
					let item = document.querySelector('div#prompt-textarea.ProseMirror');
					item.focus();

					// 插入文本
					setTimeout(() => {
						document.execCommand('insertText', false, ctx);
					}, 1000);
					let i = 100;
					// 等待按钮可点击
					while (true) {
						let item = document.querySelector('button#composer-submit-button')
						if(!item){
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
				let button = document.querySelector('button#composer-submit-button');
				while(!button){
					await delay(100);
					button = document.querySelector('button#composer-submit-button');
				}
				button.click();
			}
			click();
			`
		)
		return msg;
	}

	async number_of_receive_msg() {
		let msg = await this.webview.executeJavaScript(
			`
			function number_of_receive_msg(){
				let btns = document.querySelectorAll('div[data-message-author-role="assistant"]');
				let N = parseInt(btns.length);
				if(N>0){
					let v = btns[btns.length-1];
					let btn = v.closest('article').querySelector('button[data-testid="good-response-turn-action-button"]');
					if(!btn){
						N = N-1;
					}
				}
				
				return N;
			}
			number_of_receive_msg()
			`
		)
		return msg;
	}

	async get_last_content() {
		let doc = await this.document();
		let items = Array.from(doc.querySelectorAll('div[data-message-author-role="assistant"] div.markdown'));
		let ctx = this.html_to_markdown(items[items.length - 1].outerHTML);
		return ctx;
	}

}
