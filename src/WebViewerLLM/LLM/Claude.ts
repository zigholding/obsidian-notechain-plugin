import { App, Notice } from 'obsidian';

import { BaseWebViewer } from './BaseWebViewer';

export class Claude extends BaseWebViewer {
	constructor(app: App, homepage = 'https://claude.ai/') {
		super(app, homepage, 'Claude');
	}

	async new_chat() {
		let msg = await this.webview.executeJavaScript(
			`
			document.querySelector(
				'a[aria-label="New chat"]'
			).click()
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
				function delay(ms) {
					return new Promise(resolve => {
					setTimeout(resolve, ms);
					});
				}

				async function insertTextAndSend(ctx) {
					let item = editor = document.querySelector(".ProseMirror");
					item.focus();
					
					setTimeout(() => {
						document.execCommand("insertText", false, "${ctx}");
					}, 1000);
					let i = 100;
					while (true) {
						let button = document.querySelector('button[aria-label="Send message"]');
						if(button.getAttribute('disabled')==''){
							await delay(100);
							continue;
						}
						i = i-1;
						if(i<0){break}
					}
				}

				insertTextAndSend(\`${ctx}\`);
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
				let button = document.querySelector('button[aria-label="Send message"]');
				if(!button){
					return;
				}
				
				while(button.getAttribute('disabled')==''){
					await delay(100);
					button = document.querySelector('button[aria-label="Send message"]');
				}
				button.click();
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
				let items = document.querySelectorAll('.font-claude-response.relative');
				let N = parseInt(items.length);
				let v = items[items.length-1];
				if(!v){return 0}
				v = v.closest('div[data-test-render-count]');
				v = v.querySelector('div.w-fit[data-state="closed"]');
				if(!v){
					N = N-1;
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
		let items = doc.querySelectorAll('.font-claude-response.relative');
		if (items.length < 1) {
			return "";
		}
		let item = items[items.length - 1];
		let ctx = await this.html_to_markdown(item.outerHTML);
		return ctx;
	}
}
