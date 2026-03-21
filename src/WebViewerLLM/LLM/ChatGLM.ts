import { App,Notice } from 'obsidian';

import { BaseWebViewer } from './BaseWebViewer';

export class ChatGLM extends BaseWebViewer {
    constructor(app: App,homepage='https://chatglm.cn/') {
		super(app, homepage,'智谱');
	}

	async new_chat(){
		let msg = await (this.view as any).webview.executeJavaScript(
			`
			document.querySelector('div.subject.active')?.click()
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
					let item = document.querySelector('textarea');
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
				let button = document.querySelector('.enter_icon.el-tooltip__trigger.el-tooltip__trigger:not(.empty)');
				if(button){
					let inputEl = document.querySelector('textarea');

					// 2. 通知 Vue/React 数据变了
					inputEl.dispatchEvent(new Event('input', { bubbles: true }));

					// 3. 模拟按下 Enter 发送
					inputEl.dispatchEvent(new KeyboardEvent('keydown', {
						bubbles: true,
						cancelable: true,
						key: 'Enter',
						code: 'Enter'
						}));
					inputEl.dispatchEvent(new KeyboardEvent('keyup', {
						bubbles: true,
						cancelable: true,
						key: 'Enter',
						code: 'Enter'
					}));
					await delay(100);
					button = document.querySelector('.enter_icon.el-tooltip__trigger.el-tooltip__trigger:not(.empty)');
				}
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
				let items = document.querySelectorAll('.answer-content-wrap:not(.text-thinking-content)');
				let N = parseInt(items.length);
				let v = items[items.length-1];
				if(!v){return 0}
				v = v.closest('.answer');
				v = v.querySelector('div.copy');
				if(!v){
					N = 1;
				}
				// let button = document.querySelector('.enter_icon.el-tooltip__trigger.el-tooltip__trigger');
				// if(!button){
				// 	N = N-1;
				// }
				return N;
			}
			number_of_receive_msg()
			`
		)
		return msg;
	}

	async get_last_content(){
		let doc = await this.document();
		let items = Array.from(doc.querySelectorAll('.answer-content-wrap:not(.text-thinking-content)'));
		let ctx = this.html_to_markdown(items[items.length-1].outerHTML);
		return ctx;
	}
}
