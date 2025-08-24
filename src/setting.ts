import {
	App, PluginSettingTab, Setting, Plugin
} from 'obsidian';

import NoteChainPlugin from '../main';


export interface NCSettings {
	field_of_prevnote: string;
	field_of_nextnote: string;
	field_of_display_text: string;
	field_of_confluence_tab_format: string;
	field_of_background_color: string;
	PrevChain: string;
	NextChain: string;
	auto_notechain: boolean;
	notice_while_modify_chain: boolean;
	refreshDataView: boolean;
	refreshTasks: boolean,
	isSortFileExplorer: boolean,
	isFolderFirst: boolean,
	isdraged: boolean,
	suggesterNotesMode: string,
	wordcout: boolean,
	wordcountxfolder: string,
	modal_default_width: number,
	modal_default_height: number,
	avata: string,
	tpl_tags_folder: string,
}

export const DEFAULT_SETTINGS: NCSettings = {
	PrevChain: "10",
	NextChain: "10",
	field_of_prevnote: 'PrevNote',
	field_of_nextnote: 'NextNote',
	field_of_display_text: 'notechain.display',
	field_of_confluence_tab_format: 'notechain.level',
	field_of_background_color: 'notechain.style',
	auto_notechain: false,
	notice_while_modify_chain: false,
	refreshDataView: true,
	refreshTasks: true,
	isSortFileExplorer: true,
	isFolderFirst: true,
	isdraged: true,
	suggesterNotesMode: '',
	wordcout: true,
	wordcountxfolder: '',
	modal_default_width: 800,
	modal_default_height: 600,
	avata: 'avata',
	tpl_tags_folder: '脚本笔记\nScriptNote',
}


export class NCSettingTab extends PluginSettingTab {
	plugin: NoteChainPlugin;

	constructor(app: App, plugin: NoteChainPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName(this.plugin.strings.setting_isSortFileExplorer)
			.addToggle(text => text
				.setValue(this.plugin.settings.isSortFileExplorer)
				.onChange(async (value) => {
					this.plugin.settings.isSortFileExplorer = value;
					await this.plugin.saveSettings();
					this.plugin.explorer.sort();
				})
			);

		new Setting(containerEl)
			.setName(this.plugin.strings.setting_isFolderFirst)
			.addToggle(text => text
				.setValue(this.plugin.settings.isFolderFirst)
				.onChange(async (value) => {
					this.plugin.settings.isFolderFirst = value;
					await this.plugin.saveSettings();
					this.plugin.explorer.sort();
				})
			);

		new Setting(containerEl)
			.setName(this.plugin.strings.setting_isdraged)
			.addToggle(text => text
				.setValue(this.plugin.settings.isdraged)
				.onChange(async (value) => {
					this.plugin.settings.isdraged = value;
					await this.plugin.saveSettings();
					this.plugin.explorer.sort();
				})
			);


		new Setting(containerEl)
			.setName(this.plugin.strings.setting_PrevChain)
			.addText(text => text
				.setValue(this.plugin.settings.PrevChain)
				.onChange(async (value) => {
					this.plugin.settings.PrevChain = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(this.plugin.strings.setting_suggesterNotesMode)
			.addDropdown(dropdown => dropdown
				.addOption('item_get_brothers', this.plugin.strings.item_get_brothers)
				.addOption('item_uncle_notes', this.plugin.strings.item_uncle_notes)
				.addOption('item_notechain', this.plugin.strings.item_notechain)
				.addOption('item_same_folder', this.plugin.strings.item_same_folder)
				.addOption('item_inlinks_outlinks', this.plugin.strings.item_inlinks_outlinks)
				.addOption('item_inlins', this.plugin.strings.item_inlins)
				.addOption('item_outlinks', this.plugin.strings.item_outlinks)
				.addOption('item_all_noes', this.plugin.strings.item_all_noes)
				.addOption('item_recent', this.plugin.strings.item_recent)
				.addOption('', '')

				.setValue(this.plugin.settings.suggesterNotesMode)
				.onChange(async (value) => {
					this.plugin.settings.suggesterNotesMode = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(this.plugin.strings.setting_NextChain)
			.addText(text => text
				.setValue(this.plugin.settings.NextChain)
				.onChange(async (value) => {
					this.plugin.settings.NextChain = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(this.plugin.strings.setting_auto_notechain)
			.addToggle(text => text
				.setValue(this.plugin.settings.auto_notechain)
				.onChange(async (value) => {
					this.plugin.settings.auto_notechain = value;
					await this.plugin.saveSettings();
				})
			);
		new Setting(containerEl)
			.setName(this.plugin.strings.setting_field_of_prevnote)
			.addText(text => text
				.setValue(this.plugin.settings.field_of_prevnote)
				.onChange(async (value) => {
					this.plugin.settings.field_of_prevnote = value;
					this.plugin.explorer.set_display_text()
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(this.plugin.strings.setting_field_of_nextnote)
			.addText(text => text
				.setValue(this.plugin.settings.field_of_nextnote)
				.onChange(async (value) => {
					this.plugin.settings.field_of_nextnote = value;
					this.plugin.explorer.set_display_text()
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName(this.plugin.strings.setting_field_of_display_text)
			.addText(text => text
				.setValue(this.plugin.settings.field_of_display_text)
				.onChange(async (value) => {
					this.plugin.settings.field_of_display_text = value;
					this.plugin.explorer.set_display_text()
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(this.plugin.strings.setting_confluence_tab_format)
			.addText(text => text
				.setValue(this.plugin.settings.field_of_confluence_tab_format)
				.onChange(async (value) => {
					this.plugin.settings.field_of_confluence_tab_format = value;
					this.plugin.explorer.set_display_text()
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(this.plugin.strings.setting_field_of_background_color)
			.addText(text => text
				.setValue(this.plugin.settings.field_of_background_color)
				.onChange(async (value) => {
					this.plugin.settings.field_of_background_color = value;
					this.plugin.explorer.set_fileitem_style()
					await this.plugin.saveSettings();
				}));


		new Setting(containerEl)
			.setName(this.plugin.strings.setting_notice_while_modify_chain)
			.addToggle(text => text
				.setValue(this.plugin.settings.notice_while_modify_chain)
				.onChange(async (value) => {
					this.plugin.settings.notice_while_modify_chain = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName(this.plugin.strings.setting_refreshDataView)
			.addToggle(text => text
				.setValue(this.plugin.settings.refreshDataView)
				.onChange(async (value) => {
					this.plugin.settings.refreshDataView = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName(this.plugin.strings.setting_refreshTasks)
			.addToggle(text => text
				.setValue(this.plugin.settings.refreshTasks)
				.onChange(async (value) => {
					this.plugin.settings.refreshTasks = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName(this.plugin.strings.setting_wordcout)
			.addToggle(text => text
				.setValue(this.plugin.settings.wordcout)
				.onChange(async (value) => {
					this.plugin.settings.wordcout = value;
					await this.plugin.saveSettings();
					this.plugin.wordcout.register();
				})
			);

		new Setting(containerEl)
			.setName(this.plugin.strings.setting_wordcout_xfolder)
			.addTextArea(text => text
				.setValue(this.plugin.settings.wordcountxfolder)
				.onChange(async (value) => {
					this.plugin.settings.wordcountxfolder = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName(this.plugin.strings.setting_avata)
			.addTextArea(text => text
				.setValue(this.plugin.settings.avata)
				.onChange(async (value) => {
					this.plugin.settings.avata = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName(this.plugin.strings.setting_templater_tag)
			.addTextArea(text => text
				.setValue(this.plugin.settings.tpl_tags_folder)
				.onChange(async (value) => {
					this.plugin.settings.tpl_tags_folder = value;
					await this.plugin.saveSettings();
				})
			);
	}
}
