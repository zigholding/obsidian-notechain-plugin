import {
	App, Notice, PluginSettingTab
} from 'obsidian';

import NoteChainPlugin from './plugin';
import { restartHttpServer } from 'src/NoteChain/setting';
import { strings as ncStrings } from './NoteChain/strings';
import { strings as wvStrings } from './WebViewerLLM/strings';

function getPath(obj: Record<string, unknown>, path: string): unknown {
	let cursor: unknown = obj;
	for (const part of path.split('.')) {
		if (cursor === null || cursor === undefined || typeof cursor !== 'object') {
			return undefined;
		}
		cursor = (cursor as Record<string, unknown>)[part];
	}
	return cursor;
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
	const parts = path.split('.');
	const last = parts.pop();
	if (!last) { return; }
	let cursor: Record<string, unknown> = obj;
	for (const part of parts) {
		const next = cursor[part];
		if (next === null || typeof next !== 'object') {
			cursor[part] = {};
		}
		cursor = cursor[part] as Record<string, unknown>;
	}
	cursor[last] = value;
}

/** Obsidian 1.13.6+ declarative settings (search + UI). */
export class NCSettingTab extends PluginSettingTab {
	plugin: NoteChainPlugin;

	constructor(app: App, plugin: NoteChainPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getControlValue(key: string): unknown {
		return getPath(this.plugin.settings, key);
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const nc = this.plugin.settings.notechain;
		if (key === 'notechain.httpServerHttpsEnabled' && !value && !nc.httpServerHttpEnabled) {
			new Notice(ncStrings.setting_httpServer_need_one_protocol);
			return;
		}
		if (key === 'notechain.httpServerHttpEnabled' && !value && !nc.httpServerHttpsEnabled) {
			new Notice(ncStrings.setting_httpServer_need_one_protocol);
			return;
		}

		setPath(this.plugin.settings, key, value);
		await this.plugin.saveSettings();

		if (
			key === 'notechain.isSortFileExplorer' ||
			key === 'notechain.isFolderFirst' ||
			key === 'notechain.isdraged'
		) {
			await this.plugin.explorer.sort();
		}
		if (
			key === 'notechain.field_of_prevnote' ||
			key === 'notechain.field_of_nextnote' ||
			key === 'notechain.field_of_display_text' ||
			key === 'notechain.field_of_confluence_tab_format'
		) {
			this.plugin.explorer.set_display_text();
		}
		if (key === 'notechain.field_of_background_color') {
			await this.plugin.explorer.set_fileitem_style();
		}
		if (key === 'notechain.wordcout') {
			this.plugin.wordcount.register();
		}
		if (key === 'notechain.httpServerEnabled') {
			if (value) {
				await restartHttpServer(this.plugin);
			} else {
				await this.plugin.httpServer?.stop();
			}
		} else if (
			key === 'notechain.httpServerHttpsEnabled' ||
			key === 'notechain.httpServerHttpEnabled' ||
			key === 'notechain.httpServerHost' ||
			key === 'notechain.httpServerPort'
		) {
			if (nc.httpServerEnabled) {
				await restartHttpServer(this.plugin);
			}
		}
	}

	getSettingDefinitions() {
		const s = ncStrings;
		const w = wvStrings;
		const isZh = window.localStorage.getItem('language') === 'zh';
		const httpOff = () => !this.plugin.settings.notechain.httpServerEnabled;
		const httpNoProto = () => {
			const n = this.plugin.settings.notechain;
			return !n.httpServerEnabled || (!n.httpServerHttpsEnabled && !n.httpServerHttpEnabled);
		};

		return [
			{ type: 'group' as const, heading: this.tabLabel('notechain'), items: [
				{ name: s.setting_isSortFileExplorer, control: { type: 'toggle' as const, key: 'notechain.isSortFileExplorer' } },
				{ name: s.setting_isFolderFirst, control: { type: 'toggle' as const, key: 'notechain.isFolderFirst' } },
				{ name: s.setting_isdraged, control: { type: 'toggle' as const, key: 'notechain.isdraged' } },
				{ name: s.setting_PrevChain, control: { type: 'text' as const, key: 'notechain.PrevChain' } },
				{
					name: s.setting_suggesterNotesMode,
					control: {
						type: 'dropdown' as const,
						key: 'notechain.suggesterNotesMode',
						options: {
							item_get_brothers: s.item_get_brothers,
							item_uncle_notes: s.item_uncle_notes,
							item_notechain: s.item_notechain,
							item_same_folder: s.item_same_folder,
							item_inlinks_outlinks: s.item_inlinks_outlinks,
							item_inlins: s.item_inlins,
							item_outlinks: s.item_outlinks,
							item_all_noes: s.item_all_noes,
							item_recent: s.item_recent,
							'': '',
						},
					},
				},
				{ name: s.setting_NextChain, control: { type: 'text' as const, key: 'notechain.NextChain' } },
				{ name: s.setting_auto_notechain, control: { type: 'toggle' as const, key: 'notechain.auto_notechain' } },
				{ name: s.setting_field_of_prevnote, control: { type: 'text' as const, key: 'notechain.field_of_prevnote' } },
				{ name: s.setting_field_of_nextnote, control: { type: 'text' as const, key: 'notechain.field_of_nextnote' } },
				{ name: s.setting_field_of_display_text, control: { type: 'text' as const, key: 'notechain.field_of_display_text' } },
				{ name: s.setting_confluence_tab_format, control: { type: 'text' as const, key: 'notechain.field_of_confluence_tab_format' } },
				{ name: s.setting_field_of_background_color, control: { type: 'text' as const, key: 'notechain.field_of_background_color' } },
				{ name: s.setting_notice_while_modify_chain, control: { type: 'toggle' as const, key: 'notechain.notice_while_modify_chain' } },
				{ name: s.setting_refreshDataView, control: { type: 'toggle' as const, key: 'notechain.refreshDataView' } },
				{ name: s.setting_refreshTasks, control: { type: 'toggle' as const, key: 'notechain.refreshTasks' } },
				{
					name: s.setting_modal_default_size,
					desc: s.setting_modal_default_size_desc,
					control: { type: 'number' as const, key: 'notechain.modal_default_width', min: 1, placeholder: '800' },
				},
				{
					name: s.setting_modal_default_size,
					desc: isZh ? '高度（像素）' : 'Height (px)',
					control: { type: 'number' as const, key: 'notechain.modal_default_height', min: 1, placeholder: '600' },
				},
				{
					name: s.setting_modal_default_size_mobile,
					desc: s.setting_modal_default_size_mobile_desc,
					control: { type: 'number' as const, key: 'notechain.modal_default_width_mobile', min: 0, placeholder: '0' },
				},
				{
					name: s.setting_modal_default_size_mobile,
					desc: isZh ? '高度（像素）' : 'Height (px)',
					control: { type: 'number' as const, key: 'notechain.modal_default_height_mobile', min: 0, placeholder: '0' },
				},
				{ name: s.setting_wordcout, control: { type: 'toggle' as const, key: 'notechain.wordcout' } },
				{ name: s.setting_wordcout_xfolder, control: { type: 'textarea' as const, key: 'notechain.wordcountxfolder', rows: 3 } },
				{ name: s.setting_avata, control: { type: 'textarea' as const, key: 'notechain.avata', rows: 2 } },
				{ name: s.setting_templater_tag, control: { type: 'textarea' as const, key: 'notechain.tpl_tags_folder', rows: 3 } },
				{
					name: s.setting_httpServer_enabled,
					desc: s.setting_httpServer_enabled_desc,
					control: { type: 'toggle' as const, key: 'notechain.httpServerEnabled' },
				},
				{
					name: s.setting_httpServer_https_enabled,
					desc: s.setting_httpServer_https_enabled_desc,
					control: {
						type: 'toggle' as const,
						key: 'notechain.httpServerHttpsEnabled',
						disabled: httpOff,
					},
				},
				{
					name: s.setting_httpServer_http_enabled,
					desc: s.setting_httpServer_http_enabled_desc,
					control: {
						type: 'toggle' as const,
						key: 'notechain.httpServerHttpEnabled',
						disabled: httpOff,
					},
				},
				{
					name: s.setting_httpServer_host,
					desc: s.setting_httpServer_host_desc,
					control: {
						type: 'text' as const,
						key: 'notechain.httpServerHost',
						disabled: httpNoProto,
					},
				},
				{
					name: s.setting_httpServer_port,
					desc: s.setting_httpServer_port_desc,
					control: {
						type: 'number' as const,
						key: 'notechain.httpServerPort',
						min: 1,
						max: 65535,
						disabled: httpOff,
					},
				},
			]},
			{ type: 'group' as const, heading: this.tabLabel('webviewer_llm'), items: [
				{ name: w.setting_prompt_name, control: { type: 'textarea' as const, key: 'webviewllm.prompt_name', rows: 3 } },
				{ name: w.setting_add_reference, control: { type: 'toggle' as const, key: 'webviewllm.add_reference' } },
				{ name: w.setting_preprocess, control: { type: 'textarea' as const, key: 'webviewllm.preprocess', rows: 3 } },
				{
					name: w.setting_write_clipboard,
					control: {
						type: 'dropdown' as const,
						key: 'webviewllm.write_clipboard',
						options: {
							'1': isZh ? '仅复制' : 'Only copy',
							'2': isZh ? '复制并发送' : 'Copy and send',
							'3': isZh ? '不复制' : 'Not copy',
						},
					},
				},
				{ name: w.setting_postprocess, control: { type: 'textarea' as const, key: 'webviewllm.postprocess', rows: 3 } },
				{ name: w.setting_auto_stop, control: { type: 'textarea' as const, key: 'webviewllm.auto_stop', rows: 3 } },
				{ name: w.setting_turndown_styles, control: { type: 'textarea' as const, key: 'webviewllm.turndown_styles', rows: 6 } },
			]},
		];
	}

	private tabLabel(id: string): string {
		switch (id) {
			case 'notechain':
				return this.plugin.strings.setting_tab_notechain;
			case 'webviewer_llm':
				return this.plugin.strings.setting_tab_webviewer_llm;
			default:
				return id;
		}
	}

	/** Typings still mark SettingTab.display as abstract; 1.13.6+ UI uses getSettingDefinitions(). */
	display(): void {}
}
