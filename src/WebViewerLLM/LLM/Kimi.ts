import { App,Notice } from 'obsidian';

import { BaseWebViewer } from './BaseWebViewer';

export class Kimi extends BaseWebViewer {
	constructor(app: App,homepage='https://www.kimi.com/') {
		super(app, homepage,'Kimi');
	}
	async new_chat(){
		let msg = await (this.view as any).webview.executeJavaScript(
			`
			document.querySelector('.new-chat-btn').click()
			`
		)
		return msg;
	}
	async click_btn_of_send(){
		let msg = await (this.view as any).webview.executeJavaScript(
			`
			function delay(ms) {
				return new Promise(resolve => {
					setTimeout(resolve, ms);
				});
			}
			async function click(){
				let button = document.querySelector('.send-button');
				let ariaDisabled = button.parentElement.classList.contains('disabled');
				while(!ariaDisabled){
					button.click();
					await delay(100);
					button = document.querySelector('.send-button');
					ariaDisabled = button.parentElement.classList.contains('disabled');
				}
			}
			click();
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
					let item = document.querySelector('.chat-input-editor-container').querySelector('.chat-input-editor');
					item.focus();

					// 插入文本
					setTimeout(() => {
						document.execCommand('insertText', false, ctx);
					}, 1000);
					let i = 100;
					// 等待按钮可点击
					while (true) {
						let button = document.querySelector('.send-button');;
						let ariaDisabled = button.parentElement.classList.contains('disabled');
						if (ariaDisabled == false) {
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

	async number_of_copy_btns(){
		let doc = await this.document();
		let btns = doc.querySelectorAll('svg[name="Like"]')
		return btns.length;
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

	async get_last_content(){
		let doc = await this.document();
		let chats = doc.getElementsByClassName("chat-content-item");
		let item = chats[chats.length-1].querySelector('.segment-content-box');
		if(item){
			return this.html_to_markdown(item.outerHTML)
		}else{
			return ''
		}
	}

	async number_of_receive_msg(){
		let doc = await this.document();
		let btns = doc.querySelectorAll('svg[name="Like"]')
		return btns.length;
	}


	async request(ctx:string,timeout=60): Promise<string> {
		let N1 = await this.number_of_receive_msg();
		
		await this.paste_msg(ctx);
		await this.delay(1000);
		await this.click_btn_of_send();
		let N2 = await this.number_of_receive_msg();
		
		while(N2!=N1+1){
			await this.delay(1000);
			N2 = await this.number_of_receive_msg();
			timeout = timeout-1;
			if(timeout<0){
				break;
			}
		}
		if(N2==N1+1){
			let doc=await this.document();
			let chats = doc.getElementsByClassName("chat-content-item");
			new Notice(`${this.name} 说了点什么`)
			let res = chats[chats.length-1].querySelector('.segment-content-box')?.textContent ?? "";
			if(res?.contains('当前长文本对话已达20轮')){
				await this.new_chat();
				return this.request(ctx);
			}else{
				return res;
			}
			
		}else{
			let res = await this.get_last_content();
			if(res?.contains('当前长文本对话已达20轮')){
				await this.new_chat();
				return this.request(ctx);
			}
			new Notice(`${this.name} 不说话`)
			return "";
		}
	}

}
