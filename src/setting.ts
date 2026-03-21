import {
	App, PluginSettingTab, Setting, ButtonComponent
} from 'obsidian';

import NoteChainPlugin from '../main';
import { renderNoteChainSettings } from 'src/NoteChain/setting';
import { renderWebViewerLLMSettings } from 'src/WebViewerLLM/setting';


export class NCSettingTab extends PluginSettingTab {
	plugin: NoteChainPlugin;
	activeTab: string = 'notechain';
	tabs: { id: string; name: string }[] = [];

	constructor(app: App, plugin: NoteChainPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.tabs = [
			{ id: "notechain", name: "notechain" }, 
			{ id: "webviewer_llm", name: "webviewer_llm" },
		]
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		const tabsContainer = containerEl.createDiv("nav-buttons-container");
		tabsContainer.addClasses(["modal-opener-tabs"]);
		this.tabs.forEach((tab) => {
			const btn = new ButtonComponent(tabsContainer).setButtonText(tab.name).onClick(() => {
				this.activeTab = tab.id;
				this.display();
			});
			if (this.activeTab === tab.id) {
				btn.buttonEl.addClass("is-active");
			}
		});

		const panelEl = containerEl.createDiv('nc-setting-tab-panel');
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

