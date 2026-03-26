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
		ctx = this.get_safe_ctx(ctx);
		const msg = await this.webview.executeJavaScript(
			`
			(async () => {
				const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
				let editor = document.querySelector('div#prompt-textarea.ProseMirror');
				let retries = 80;
				while (!editor && retries-- > 0) {
					await delay(50);
					editor = document.querySelector('div#prompt-textarea.ProseMirror');
				}
				if (!editor) {
					return false;
				}
				editor.focus();

				// 直接写入文本并主动触发 input 事件，避免固定等待导致的卡顿
				editor.textContent = \`${ctx}\`;
				editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: \`${ctx}\` }));

				let button = document.querySelector('button#composer-submit-button');
				retries = 80;
				while ((!button || button.disabled) && retries-- > 0) {
					await delay(50);
					button = document.querySelector('button#composer-submit-button');
				}
				return !!button && !button.disabled;
			})()
			`
		);
		return msg;
	}

	async click_btn_of_send() {
		let msg = await this.webview.executeJavaScript(
			`
			async function click(){
				const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
				let button = document.querySelector('button#composer-submit-button');
				let retries = 80;
				while((!button || button.disabled) && retries-- > 0){
					await delay(50);
					button = document.querySelector('button#composer-submit-button');
				}
				if(!button || button.disabled){
					return false;
				}
				button.click();
				return true;
			}
			click();
			`
		)
		return msg;
	}

	async request(ctx: string, timeout = 120) {
		let N1 = await this.number_of_receive_msg();
		await this.paste_msg(ctx);
		await this.click_btn_of_send();

		let N2 = await this.number_of_receive_msg();
		while (N2 != N1 + 1) {
			await this.delay(800);
			N2 = await this.number_of_receive_msg();
			timeout = timeout - 1;
			if (timeout < 0) {
				break;
			}
		}

		if (N2 == N1 + 1) {
			const rsp = await this.get_last_content();
			new Notice(`${this.name} 说了点什么`);
			return rsp;
		} else {
			new Notice(`${this.name} 不说话`);
			console.log(this.name, N1, N2);
			return null;
		}
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
