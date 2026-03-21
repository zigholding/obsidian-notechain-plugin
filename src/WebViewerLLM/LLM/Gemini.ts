import { App, Notice } from 'obsidian';

import { BaseWebViewer } from './BaseWebViewer';

export class Gemini extends BaseWebViewer {
	constructor(app: App, homepage = 'https://gemini.google.com/') {
		super(app, homepage, 'Gemini');
	}

	async new_chat() {
		let msg = await this.webview.executeJavaScript(
			`
				document.querySelector(
					'side-nav-action-button[data-test-id="new-chat-button"]'
				)?.querySelector('button').click()
				`
		);
		return msg;
	}

	async paste_msg(ctx: string) {
		let msg;
		ctx = this.get_safe_ctx(ctx);
		const maxRetries = 1;
		for (let attempt = 0; attempt < maxRetries; attempt++) {
			msg = await this.webview.executeJavaScript(
				`
        		(async function() {
					function delay(ms) {
						return new Promise(resolve => {
						setTimeout(resolve, ms);
						});
					}
	
					async function insertTextAndSend(ctx) {
						let item = document.querySelector('rich-textarea');
						let editableDiv = item.querySelector('div.ql-editor[contenteditable="true"]');
						editableDiv.focus();
						editableDiv.innerText = ctx;
						editableDiv.dispatchEvent(new Event('input', { bubbles: true }));
						let i = 100;
						while (true) {
							let button = document.querySelector('button.send-button.submit');
							if (button) {
								break;
							} else {
								await delay(100);
							}
							i = i-1;
							if(i<0){break}
						}
						return item.textContent
					}
					return await insertTextAndSend(\`${ctx}\`);
				})();
				`
			);
			if (msg) {
				break;
			}
			await this.delay(1e3);
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
					let button = document.querySelector('button.send-button.submit');
					let ariaDisabled = button.getAttribute('aria-disabled');
					while(button || ariaDisabled=='false'){
						try {
							// 触发点击
							button.click(); // Bard 控制台安全调用内部发送方法的 JS 脚本
						} catch (err) {
							console.error("点击按钮失败:", err);
						}
						
						await delay(100);
						button = document.querySelector('button.send-button.submit');
						ariaDisabled = button?.getAttribute('aria-disabled');
					}
				}
				click();
				`
		);
		return msg;
	}

	async number_of_receive_msg() {
		let msg = await this.webview.executeJavaScript(
			`
				function number_of_receive_msg(){
					let items = document.querySelectorAll('model-response');
					let N = parseInt(items.length);
					let v = items[items.length-1];
					if(!v){return 0}
					//v = v.closest('.answer');
					v = v.querySelector('thumb-down-button');
					if(!v){
						N = 1;
					}
					return N;
				}
				number_of_receive_msg()
				`
		);
		return msg;
	}

	async get_last_content() {
		// let doc = await ea..document();
		let html = await this.webview.executeJavaScript(`document.documentElement.outerHTML`);
		let parser = new DOMParser();
		let doc = parser.parseFromString(html, "text/html");
		let items = doc.querySelectorAll('model-response');
		if (items.length < 1) {
			return "";
		}
		let item = items[items.length - 1];
		let ctx = await this.html_to_markdown(item.outerHTML);
		return ctx;
	}
}
