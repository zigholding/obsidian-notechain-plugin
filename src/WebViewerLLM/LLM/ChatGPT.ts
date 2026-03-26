import { App, Notice } from 'obsidian';

import { chatGPTProfile } from './LLMProfiles';
import { SelectorDrivenWebViewer } from './SelectorDrivenWebViewer';

export class ChatGPT extends SelectorDrivenWebViewer {
	constructor(app: App, homepage = 'https://chatgpt.com') {
		super(app, homepage, 'ChatGPT', chatGPTProfile);
	}

	async request(ctx: string, timeout = 120) {
		let N1 = await this.number_of_receive_msg();
		await this.paste_msg(ctx);
		await this.click_btn_of_send();

		let N2 = await this.number_of_receive_msg();
		while (N2 < N1 + 1) {
			await this.delay(800);
			N2 = await this.number_of_receive_msg();
			timeout = timeout - 1;
			if (timeout < 0) {
				break;
			}
		}

		if (N2 >= N1 + 1) {
			let prevRsp = '';
			let stableRounds = 0;
			while (timeout >= 0) {
				const [isDone, rspRaw] = await Promise.all([
					this.is_last_reply_done(),
					this.get_last_content(),
				]);
				const rsp = (rspRaw ?? '').trim();

				if (rsp !== '' && rsp === prevRsp) {
					stableRounds = stableRounds + 1;
				} else {
					stableRounds = 0;
				}
				if (rsp !== '') {
					prevRsp = rsp;
				}

				// done + content stable 至少一次，避免流式刚起步就提前返回
				if (isDone && prevRsp !== '' && stableRounds >= 1) {
					new Notice(`${this.name} 说了点什么`);
					return prevRsp;
				}

				await this.delay(800);
				timeout = timeout - 1;
			}
			if (prevRsp !== '') {
				new Notice(`${this.name} 说了点什么`);
				return prevRsp;
			}
			new Notice(`${this.name} 不说话`);
			return '';
		} else {
			new Notice(`${this.name} 不说话`);
			console.log(this.name, N1, N2);
			return null;
		}
	}

	async is_last_reply_done() {
		const msg = await this.webview.executeJavaScript(
			`
			(() => {
				const stopBtn =
					document.querySelector('button[data-testid="stop-button"]') ||
					document.querySelector('button[aria-label*="Stop"]') ||
					document.querySelector('button[aria-label*="停止"]');
				if (stopBtn) {
					return false;
				}
				const items = document.querySelectorAll('div[data-message-author-role="assistant"]');
				if (!items || items.length === 0) {
					return false;
				}
				const last = items[items.length - 1];
				const article = last && last.closest ? last.closest('article') : null;
				if (!article) {
					return false;
				}
				const doneBtn =
					article.querySelector('button[data-testid="good-response-turn-action-button"]') ||
					article.querySelector('button[data-testid="copy-turn-action-button"]');
				return !!doneBtn;
			})()
			`
		);
		return !!msg;
	}

}
