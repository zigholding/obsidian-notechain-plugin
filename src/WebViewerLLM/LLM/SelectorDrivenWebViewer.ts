import { App } from 'obsidian';

import { BaseWebViewer } from './BaseWebViewer';

type MaybeArray<T> = T | T[];

export interface WebViewerSelectorProfile {
	newChatSelectors?: string[];
	inputSelectors?: string[];
	sendButtonSelectors?: string[];
	receiveMessageSelectors?: string[];
	receiveDoneSelectors?: string[];
	lastContentSelectors?: string[];
	lastContentFilterSelector?: string;
	copyButtonSelectors?: string[];
}

const toSelectorArray = (value?: MaybeArray<string>): string[] => {
	if (!value) {
		return [];
	}
	return Array.isArray(value) ? value : [value];
};

export class SelectorDrivenWebViewer extends BaseWebViewer {
	protected profile: WebViewerSelectorProfile;

	constructor(app: App, homepage = '', name = '', profile: WebViewerSelectorProfile = {}) {
		super(app, homepage, name);
		this.profile = profile;
	}

	protected mergeSelectors(...selectorGroups: Array<MaybeArray<string> | undefined>): string[] {
		return selectorGroups.flatMap(toSelectorArray).filter(Boolean);
	}

	async new_chat() {
		const selectors = this.profile.newChatSelectors ?? [];
		if (selectors.length < 1 || !this.webview) {
			return false;
		}
		const selectorList = JSON.stringify(selectors);
		return this.webview.executeJavaScript(
			`
			(() => {
				const selectors = ${selectorList};
				for (const selector of selectors) {
					const element = document.querySelector(selector);
					if (!element) continue;
					const button = element.matches('button,a,[role="button"]') ? element : element.querySelector('button,a,[role="button"]');
					const target = button || element;
					target.click();
					return true;
				}
				return false;
			})()
			`
		);
	}

	async paste_msg(ctx: string) {
		if (!this.webview) {
			return false;
		}
		const safeCtx = this.get_safe_ctx(ctx);
		const selectors = this.mergeSelectors(
			this.profile.inputSelectors,
			'textarea',
			'[contenteditable="true"]',
			'div#prompt-textarea.ProseMirror',
			'.ProseMirror',
			'.ql-editor[contenteditable="true"]'
		);
		const selectorList = JSON.stringify(selectors);

		return this.webview.executeJavaScript(
			`
			(async () => {
				const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
				const selectors = ${selectorList};
				const text = \`${safeCtx}\`;
				const pickInput = () => {
					for (const selector of selectors) {
						const el = document.querySelector(selector);
						if (el) return el;
					}
					return null;
				};

				let input = pickInput();
				let retries = 80;
				while (!input && retries-- > 0) {
					await delay(50);
					input = pickInput();
				}
				if (!input) return false;

				input.focus?.();
				if ('value' in input) {
					input.value = text;
				} else if (input.isContentEditable) {
					input.textContent = text;
				} else {
					input.textContent = text;
				}
				try {
					input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
				} catch (_) {
					input.dispatchEvent(new Event('input', { bubbles: true }));
				}
				input.dispatchEvent(new Event('change', { bubbles: true }));
				return true;
			})()
			`
		);
	}

	async click_btn_of_send() {
		if (!this.webview) {
			return false;
		}
		const selectors = this.mergeSelectors(
			this.profile.sendButtonSelectors,
			'button#composer-submit-button',
			'button[aria-label*="Send"]',
			'button[aria-label*="发送"]',
			'button.send-button',
			'button.send-button.submit',
			'[role="button"][aria-label*="Send"]',
			'[role="button"][aria-label*="发送"]'
		);
		const selectorList = JSON.stringify(selectors);

		return this.webview.executeJavaScript(
			`
			(async () => {
				const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
				const selectors = ${selectorList};
				const isEnabled = (el) => {
					if (!el) return false;
					const disabledAttr = el.getAttribute?.('disabled');
					const ariaDisabled = el.getAttribute?.('aria-disabled');
					const className = (el.className || '').toString();
					if (disabledAttr !== null) return false;
					if (ariaDisabled === 'true' || ariaDisabled === '') return false;
					if (className.includes('disabled')) return false;
					return true;
				};
				const pickButton = () => {
					for (const selector of selectors) {
						const el = document.querySelector(selector);
						if (el) return el;
					}
					const candidates = Array.from(document.querySelectorAll('button,[role="button"],a')).filter(Boolean);
					const matched = candidates.find(el => {
						const txt = (el.textContent || '').trim();
						return /(send|发送|提问|提交)/i.test(txt);
					});
					return matched || null;
				};

				let button = pickButton();
				let retries = 80;
				while ((!button || !isEnabled(button)) && retries-- > 0) {
					await delay(50);
					button = pickButton();
				}
				if (!button || !isEnabled(button)) return false;
				button.click();
				return true;
			})()
			`
		);
	}

	async number_of_receive_msg() {
		if (!this.webview) {
			return 0;
		}
		const messageSelectors = this.mergeSelectors(
			this.profile.receiveMessageSelectors,
			'div[data-message-author-role="assistant"]',
			'model-response',
			'.font-claude-response.relative',
			'.answer-content-wrap:not(.text-thinking-content)',
			'.ds-markdown'
		);
		const doneSelectors = this.profile.receiveDoneSelectors ?? [];
		const messageSelectorList = JSON.stringify(messageSelectors);
		const doneSelectorList = JSON.stringify(doneSelectors);

		return this.webview.executeJavaScript(
			`
			(() => {
				const messageSelectors = ${messageSelectorList};
				const doneSelectors = ${doneSelectorList};
				let items = [];
				for (const selector of messageSelectors) {
					items = Array.from(document.querySelectorAll(selector));
					if (items.length > 0) break;
				}
				if (items.length < 1) return 0;
				if (doneSelectors.length < 1) return items.length;
				const last = items[items.length - 1];
				for (const selector of doneSelectors) {
					if (last.querySelector(selector) || last.closest('article')?.querySelector(selector) || document.querySelector(selector)) {
						return items.length;
					}
				}
				return Math.max(0, items.length - 1);
			})()
			`
		);
	}

	async get_last_content() {
		const doc = await this.document();
		const selectors = this.mergeSelectors(
			this.profile.lastContentSelectors,
			this.profile.receiveMessageSelectors,
			'div[data-message-author-role="assistant"] div.markdown',
			'.font-claude-response.relative',
			'model-response',
			'.ds-markdown'
		);
		let items: Element[] = [];
		for (const selector of selectors) {
			items = Array.from(doc.querySelectorAll(selector));
			if (items.length > 0) {
				break;
			}
		}
		if (this.profile.lastContentFilterSelector) {
			items = items.filter(item => !item.closest(this.profile.lastContentFilterSelector));
		}
		if (items.length < 1) {
			return '';
		}
		return this.html_to_markdown(items[items.length - 1].outerHTML);
	}

	async copy_last_content() {
		if (!this.webview) {
			return false;
		}
		const selectors = this.mergeSelectors(
			this.profile.copyButtonSelectors,
			'button[data-testid*="copy"]',
			'[class*="copy"]',
			'[aria-label*="Copy"]',
			'[aria-label*="复制"]'
		);
		const selectorList = JSON.stringify(selectors);
		return this.webview.executeJavaScript(
			`
			(() => {
				const selectors = ${selectorList};
				const items = [];
				for (const selector of selectors) {
					items.push(...Array.from(document.querySelectorAll(selector)));
				}
				const byText = Array.from(document.querySelectorAll('button,[role="button"],a')).filter(el => {
					const txt = (el.textContent || '').trim();
					return /(copy|复制)/i.test(txt);
				});
				const all = [...items, ...byText];
				if (all.length < 1) return false;
				const last = all[all.length - 1];
				last.click?.();
				return true;
			})()
			`
		);
	}
}
