import {
	App, PluginSettingTab
} from 'obsidian';

import NoteChainPlugin from '../main';
import { renderNoteChainSettings } from 'src/NoteChain/setting';
import { renderWebViewerLLMSettings } from 'src/WebViewerLLM/setting';


export class NCSettingTab extends PluginSettingTab {
	plugin: NoteChainPlugin;
	activeTab: string = 'notechain';
	private readonly tabIds = ['notechain', 'webviewer_llm'] as const;

	constructor(app: App, plugin: NoteChainPlugin) {
		super(app, plugin);
		this.plugin = plugin;
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

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		const tabsEl = containerEl.createDiv({ cls: 'nc-setting-tabs', attr: { role: 'tablist' } });
		this.tabIds.forEach((tabId) => {
			const isActive = this.activeTab === tabId;
			const btn = tabsEl.createEl('button', {
				type: 'button',
				cls: 'nc-setting-tab' + (isActive ? ' is-active' : ''),
				attr: {
					role: 'tab',
					'aria-selected': isActive ? 'true' : 'false',
				},
			});
			btn.setText(this.tabLabel(tabId));
			btn.addEventListener('click', () => {
				if (this.activeTab !== tabId) {
					this.activeTab = tabId;
					this.display();
				}
			});
		});

		const panelEl = containerEl.createDiv({
			cls: 'nc-setting-tab-panel',
			attr: { role: 'tabpanel' },
		});
		switch (this.activeTab) {
			case 'notechain':
				renderNoteChainSettings(this.plugin, panelEl);
				break;
			case 'webviewer_llm':
				renderWebViewerLLMSettings(this.plugin, panelEl);
				break;
		}
	}
}

