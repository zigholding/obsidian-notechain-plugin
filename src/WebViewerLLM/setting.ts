import { Setting } from 'obsidian';

import type NoteChainPlugin from '../../main';
import { strings } from './strings';

export interface WebviewLLMSettings {
	auto_stop: string;
	prompt_name: string;
	turndown_styles: string;
	preprocess: string;
	postprocess: string;
}

export const WebViewLLMSettings_DEFAULT: WebviewLLMSettings = {
	prompt_name: 'prompt\n提示词',
	auto_stop: '修改完成\n修改完成。',
	preprocess: '',
	postprocess: '',
	turndown_styles: `
class:
- ybc-li-component_dot # 元宝列表小黑点
- hyc-common-markdown__ref-list # 元宝网页引用数字
- hyc-common-markdown__code__hd # 元宝代码复制按钮
- segment-code-header-content # Kimi代码块复制按钮
name+class:
- div search-plus # 搜索
- div hyc-common-markdown__replace-videoBox-v2 # 元宝视频
- header table-actions # Kimi 表格操作
key+value:
- data-testid doc_card # 元宝文档卡片
	`.trim(),
};

export function renderWebViewerLLMSettings(plugin: NoteChainPlugin, containerEl: HTMLElement): void {
	let settings = plugin.settings.webviewllm;

	new Setting(containerEl)
		.setName(strings.setting_prompt_name)
		.addTextArea((text) =>
			text
				.setValue(settings.prompt_name)
				.onChange(async (value) => {
					settings.prompt_name = value;
					await plugin.saveSettings();
				})
		);

	new Setting(containerEl)
		.setName(strings.setting_preprocess)
		.addTextArea((text) =>
			text
				.setValue(settings.preprocess)
				.onChange(async (value) => {
					settings.preprocess = value;
					await plugin.saveSettings();
				})
		);
	
	new Setting(containerEl)
		.setName(strings.setting_postprocess)
		.addTextArea((text) =>
			text
				.setValue(settings.postprocess)
				.onChange(async (value) => {
					settings.postprocess = value;
					await plugin.saveSettings();
				})
		);

	new Setting(containerEl)
		.setName(strings.setting_auto_stop)
		.addTextArea((text) =>
			text
				.setValue(settings.auto_stop)
				.onChange(async (value) => {
					settings.auto_stop = value;
					await plugin.saveSettings();
				})
		);

	new Setting(containerEl)
		.setName(strings.setting_turndown_styles)
		.addTextArea((text) =>
			text
				.setValue(settings.turndown_styles)
				.onChange(async (value) => {
					settings.turndown_styles = value;
					await plugin.saveSettings();
				})
		);
}
