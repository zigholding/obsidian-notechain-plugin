import { App,Notice } from 'obsidian';

import { BaseWebViewer } from './BaseWebViewer';

export class Doubao extends BaseWebViewer {
    constructor(app: App,homepage='https://www.doubao.com') {
		super(app, homepage,'豆包');
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
					console.log('hrer',document)
					let item = document.querySelector('textarea[data-testid="chat_input_input"]');
					item.focus();

					// 插入文本
					setTimeout(() => {
						document.execCommand('insertText', false, ctx);
					}, 1000);
					let i = 100;
					// 等待按钮可点击
					while (true) {
						let button = document.getElementById('flow-end-msg-send');
						let ariaDisabled = button.getAttribute('aria-disabled');
						if (ariaDisabled == 'false') {
							console.log('复制成功');
							break;
						} else {
							await delay(100);
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
				let button = document.getElementById('flow-end-msg-send');
				let ariaDisabled = button.getAttribute('aria-disabled');
				while(ariaDisabled=='false'){
					button.click();
					await delay(100);
					button = document.getElementById('flow-end-msg-send');
					ariaDisabled = button.getAttribute('aria-disabled');
				}
			}
			click();
			`
		)
		return msg;
	}

	async get_last_content() {
		let doc = await this.document();
		let items = doc.querySelectorAll('div[data-testid="receive_message"] div[data-testid="message_text_content"]');
		if(items.length<1){return ''}
		
		let item = items[items.length-1]
		let ctx = await this.html_to_markdown(item.outerHTML);
		return ctx;
	}

	async number_of_receive_msg(){
		let msg = await this.webview.executeJavaScript(
			`
			function number_of_receive_msg(){
				let items = document.querySelectorAll('div[data-testid="receive_message"]');
				if(items.length==0){
					return 0;
				}
				item = items[items.length-1]
				if(item.querySelectorAll('button[data-testid="message_action_like"]').length==0){
					msg = items.length-1;
				}else{
					msg = items.length;
				}
				return msg;
			}
			number_of_receive_msg()
			`
		)
		return msg;
	}

	async copy_last_content(){
		let msg = await this.webview.executeJavaScript(
			`
			btns = document.querySelectorAll('.segment-actions-content-btn');
			btns = Array.from(btns).filter(x=>x.textContent=='复制');
			if(btns.length>0){
				btns[btns.length-1].click();
				msg = true;
			}else{
				msg = false;
			}
			`
		)
		return msg;
	}
}
