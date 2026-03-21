import { App,Notice } from 'obsidian';
import { BaseWebViewer } from './BaseWebViewer';

export class DeepSeek extends BaseWebViewer {
	constructor(app: App,homepage='https://chat.deepseek.com') {
		super(app, homepage,'DeepSeek');
	}

	async click_btn_of_send() {
		let view = this.view;
		let msg = await (this.view as any).webview.executeJavaScript(
			`
			function delay(ms) {
				return new Promise(resolve => {
					setTimeout(resolve, ms);
				});
			}
			async function click(){
				let button = document.querySelector('div[role="button"]:not(.ds-button)');
				let ariaDisabled = button.getAttribute('aria-disabled');
				while(!ariaDisabled || ariaDisabled == 'false'){
					button.click();
					await delay(100);
					button = document.querySelector('div[role="button"]:not(.ds-button)');
					ariaDisabled =  button.getAttribute('aria-disabled');
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
					let item = document.querySelector('textarea[id="chat-input"]');
					item.focus();

					// 插入文本
					setTimeout(() => {
						document.execCommand('insertText', false, ctx);
					}, 1000);
					let i = 100;
					// 等待按钮可点击
					while (true) {
						let button = document.querySelector('div[role="button"]:not(.ds-button)');
						let ariaDisabled = button.getAttribute('aria-disabled');
						if (!ariaDisabled || ariaDisabled == 'false') {
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

	async get_last_content() {
		let doc = await this.document();
		let items = doc.querySelectorAll('.ds-markdown');
		if(items.length<1){return ''}
		
		let item = items[items.length-1]
		let ctx = this.html_to_markdown(item.outerHTML);
		return ctx;
	}

	async number_of_receive_msg() {
		let msg = await this.webview.executeJavaScript(
			`
			function number_of_receive_msg(){
				let btns = document.querySelectorAll('.ds-flex>.ds-flex >.ds-icon-button:nth-child(4)');
				let N = parseInt(btns.length);
				return N;
			}
			number_of_receive_msg()
			`
		)
		return msg;
	}

}
