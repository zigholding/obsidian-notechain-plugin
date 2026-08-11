import { Notice, TFile } from 'obsidian';

import type NoteChainPlugin from '../plugin';
import { WebViewLLMSettings_DEFAULT } from './setting';
import type { WebViewerTurndownStylesNormalized } from './WebViewerLLMModule';

export class WebViewerLLMTurndown {
	/** Host WebViewerLLMModule fields/methods (filled by applyMixins). */
	[key: string]: any;

	async get_turndown() {
		const TurndownService = (await import('turndown')).default;
		const { gfm } = await import('turndown-plugin-gfm');
		const turndown = new TurndownService({
			headingStyle: 'atx',
			bulletListMarker: '-',
			codeBlockStyle: 'fenced',
			emDelimiter: '*',
			strongDelimiter: '**',
		});

		turndown.use(gfm);
		return turndown;
	}

	get turndown_styles(): WebViewerTurndownStylesNormalized {
		const yamljs = this.easyapi.editor.yamljs;
		const parseDefault = () =>
			yamljs.load(WebViewLLMSettings_DEFAULT.turndown_styles) as Record<string, unknown>;

		let config: Record<string, unknown>;
		const yamlText = this.plugin.settings.webviewllm.turndown_styles;
		try {
			const loaded =
				yamlText != null && String(yamlText).trim() !== ''
					? yamljs.load(yamlText)
					: null;
			if (loaded != null && typeof loaded === 'object' && !Array.isArray(loaded)) {
				config = loaded as Record<string, unknown>;
			} else {
				config = parseDefault();
			}
		} catch {
			config = parseDefault();
		}

		if (!config['pre-process']) {
			config['pre-process'] = [];
		}
		if (!config['script']) {
			config['script'] = [];
		}
		if (!config['class']) {
			config['class'] = [];
		}
		if (!config['name+class']) {
			config['name+class'] = [];
		}
		if (!config['key+value']) {
			config['key+value'] = [];
		}
		if (!config['post-process']) {
			config['post-process'] = [];
		}
		return config as unknown as WebViewerTurndownStylesNormalized;
	}

	async html_to_markdown(html: string): Promise<string> {
		const turndown_styles = this.turndown_styles;

		if (Array.isArray(turndown_styles['pre-process'])) {
			const eatra = { html: html };
			for (const i of turndown_styles['pre-process']) {
				await this.easyapi.tpl.parse_templater(i, true, eatra);
				html = eatra['html'];
			}
		}

		const parser = new DOMParser();
		const doc = parser.parseFromString(html, 'text/html');
		doc.querySelectorAll('.hyc-common-markdown__ref-list').forEach((div) => {
			const next = div.nextSibling;

			if (next && next.nodeType === 3 && /^[\s。、“”，；！？（）【】：]+$/.test(next.nodeValue || '')) {
				let prev = div.previousSibling;

				if (prev && prev.nodeType === 1) {
					const textNodes = prev.childNodes;
					if (textNodes.length > 0) {
						prev = textNodes[textNodes.length - 1];
					}
				}

				if (prev && prev.nodeType === 3) {
					prev.nodeValue = (prev.nodeValue || '').trimEnd() + next.nodeValue;
					next.remove();
				}
			}

			div.remove();
		});

		html = doc.body.innerHTML;

		const turndown = await this.get_turndown();

		turndown.addRule('fixedTable', {
			filter: ['table'],
			replacement: (_content: string, node: Element) => {
				const rows = [];
				const headers = Array.from(node.querySelectorAll('th')).map((th) =>
					(th as any).textContent.replace(/\s+/g, ' ').trim()
				);
				if (headers.length > 0) {
					rows.push(`| ${headers.join(' | ')} |`);
					rows.push(`| ${headers.map(() => '---').join(' | ')} |`);
				}

				node.querySelectorAll('tr').forEach((tr: Element) => {
					const cols = Array.from(tr.querySelectorAll('td')).map((td) =>
						(td as any).textContent.replace(/\s+/g, ' ').trim()
					);
					if (cols.length > 0) {
						rows.push(`| ${cols.join(' | ')} |`);
					}
				});
				return rows.join('\n') + '\n\n';
			},
		});

		turndown.addRule('skip_class', {
			filter: function (node: Element): boolean {
				if (node.classList) {
					try {
						for (const i of turndown_styles.class) {
							const reg = new RegExp(i);
							for (const c of Array.from(node.classList)) {
								if (c.match(reg)) {
									return true;
								}
							}
						}
					} catch (e) {
						// do nothing
					}
					try {
						for (const i of turndown_styles['name+class']) {
							const items = i.trim().split(' ');
							if (items.length == 1) {
								if (node.nodeName.toLowerCase() == items[0]) {
									return true;
								}
							} else {
								const reg = new RegExp(items[1]);
								if (node.nodeName.toLowerCase() == items[0]) {
									for (const c of Array.from(node.classList)) {
										if (c.match(reg)) {
											return true;
										}
									}
								}
							}
						}
					} catch (e) {
						// do nothing
					}
				}
				try {
					for (const i of turndown_styles['key+value']) {
						const items = i.split(' ');
						const reg = new RegExp(items[1]);
						if (node.nodeType == 1) {
							return !!node.getAttribute(items[0])?.match(reg);
						}
					}
				} catch (e) {
					// do nothing
				}
				return false;
			},
			replacement: function () {
				return '';
			},
		});

		turndown.addRule('customBlockquote', {
			filter: 'blockquote',
			replacement: (content: any) => `> ${content.trim()}\n\n`,
		});

		if (Array.isArray(turndown_styles['script'])) {
			for (const i of turndown_styles['script']) {
				await this.easyapi.tpl.parse_templater(i, true, turndown);
			}
		}

		turndown.addRule('hycCodeBlock', {
			filter: (node: Element) =>
				node.nodeName === 'DIV' && node.classList.contains('hyc-code-scrollbar__view'),
			replacement: (_content: string, node: Element) => {
				const codeNode = node.querySelector('code');
				let lang = '';
				if (codeNode && codeNode.className.match(/language-(\w+)/)) {
					lang = RegExp.$1;
				}
				const codeText = codeNode ? codeNode.textContent : node.textContent;

				return `\`\`\`${lang}\n${codeText?.trim()}\n\`\`\``;
			},
		});

		let md = turndown.turndown(html);
		if (Array.isArray(turndown_styles['post-process'])) {
			const eatra = { md: md };
			for (const i of turndown_styles['post-process']) {
				await this.easyapi.tpl.parse_templater(i, true, eatra);
				md = eatra['md'];
			}
		}
		return md;
	}
}
