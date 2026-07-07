import {
	App, Notice, PluginSettingTab, Setting, ButtonComponent
} from 'obsidian';

import NoteChainPlugin from '../../main';
import { strings } from './strings';
import { getWebViewerPartition, installWebviewTlsTrust } from '../server/tlsWebviewTrust';

async function restartHttpServer(plugin: NoteChainPlugin): Promise<void> {
	const settings = plugin.settings.notechain;
	if (!plugin.httpServer) return;
	await plugin.httpServer.stop();
	plugin.httpServer.setHost(settings.httpServerHost);
	plugin.httpServer.setPort(settings.httpServerPort);
	const https = !!settings.httpServerHttpsEnabled;
	const http = !!settings.httpServerHttpEnabled;
	if (!settings.httpServerEnabled || (!https && !http)) return;
	try {
		await plugin.httpServer.start({ https, http });
		if (https) {
			installWebviewTlsTrust(
				getWebViewerPartition(plugin.app),
				plugin.httpServer.getPort(),
				plugin.httpServer.getTlsDir(),
			);
		}
		if (https) {
			console.log(`Note-Chain HTTPS: ${plugin.httpServer.getBaseUrl()}/oldbuddy`);
		}
		if (http) {
			console.log(`Note-Chain HTTP (Obsidian): ${plugin.httpServer.getObsidianOldBuddyUrl()}`);
		}
	} catch (error: any) {
		console.error('Failed to restart HTTP Server:', error);
		new Notice(`${strings.setting_httpServer_restart_failed}: ${error?.message || error}`, 5000);
	}
}

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
	httpServerHost: string,
	httpServerPort: number,
	httpServerEnabled: boolean,
	httpServerHttpsEnabled: boolean,
	httpServerHttpEnabled: boolean,
}

export const NCSettings_DEFAULT: NCSettings = {
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
	httpServerHost: "0.0.0.0",
	httpServerPort: 3000,
	httpServerEnabled: true,
	httpServerHttpsEnabled: true,
	httpServerHttpEnabled: true,
}


export function renderNoteChainSettings(plugin: NoteChainPlugin, containerEl: HTMLElement): void {
    const settings = plugin.settings.notechain;
		new Setting(containerEl)
			.setName(strings.setting_isSortFileExplorer)
			.addToggle(text => text
				.setValue(settings.isSortFileExplorer)
				.onChange(async (value) => {
					settings.isSortFileExplorer = value;
					await plugin.saveSettings();
					plugin.explorer.sort();
				})
			);

		new Setting(containerEl)
			.setName(strings.setting_isFolderFirst)
			.addToggle(text => text
				.setValue(settings.isFolderFirst)
				.onChange(async (value) => {
					settings.isFolderFirst = value;
					await plugin.saveSettings();
					plugin.explorer.sort();
				})
			);

		new Setting(containerEl)
			.setName(strings.setting_isdraged)
			.addToggle(text => text
				.setValue(settings.isdraged)
				.onChange(async (value) => {
					settings.isdraged = value;
					await plugin.saveSettings();
					plugin.explorer.sort();
				})
			);


		new Setting(containerEl)
			.setName(strings.setting_PrevChain)
			.addText(text => text
				.setValue(settings.PrevChain)
				.onChange(async (value) => {
					settings.PrevChain = value;
					await plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(strings.setting_suggesterNotesMode)
			.addDropdown(dropdown => dropdown
				.addOption('item_get_brothers', strings.item_get_brothers)
				.addOption('item_uncle_notes', strings.item_uncle_notes)
				.addOption('item_notechain', strings.item_notechain)
				.addOption('item_same_folder', strings.item_same_folder)
				.addOption('item_inlinks_outlinks', strings.item_inlinks_outlinks)
				.addOption('item_inlins', strings.item_inlins)
				.addOption('item_outlinks', strings.item_outlinks)
				.addOption('item_all_noes', strings.item_all_noes)
				.addOption('item_recent', strings.item_recent)
				.addOption('', '')

				.setValue(settings.suggesterNotesMode)
				.onChange(async (value) => {
					settings.suggesterNotesMode = value;
					await plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(strings.setting_NextChain)
			.addText(text => text
				.setValue(settings.NextChain)
				.onChange(async (value) => {
					settings.NextChain = value;
					await plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(strings.setting_auto_notechain)
			.addToggle(text => text
				.setValue(settings.auto_notechain)
				.onChange(async (value) => {
					settings.auto_notechain = value;
					await plugin.saveSettings();
				})
			);
			
		new Setting(containerEl)
			.setName(strings.setting_field_of_prevnote)
			.addText(text => text
				.setValue(settings.field_of_prevnote)
				.onChange(async (value) => {
					settings.field_of_prevnote = value;
					plugin.explorer.set_display_text()
					await plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(strings.setting_field_of_nextnote)
			.addText(text => text
				.setValue(settings.field_of_nextnote)
				.onChange(async (value) => {
					settings.field_of_nextnote = value;
					plugin.explorer.set_display_text()
					await plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName(strings.setting_field_of_display_text)
			.addText(text => text
				.setValue(settings.field_of_display_text)
				.onChange(async (value) => {
					settings.field_of_display_text = value;
					plugin.explorer.set_display_text()
					await plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(strings.setting_confluence_tab_format)
			.addText(text => text
				.setValue(settings.field_of_confluence_tab_format)
				.onChange(async (value) => {
					settings.field_of_confluence_tab_format = value;
					plugin.explorer.set_display_text()
					await plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(strings.setting_field_of_background_color)
			.addText(text => text
				.setValue(settings.field_of_background_color)
				.onChange(async (value) => {
					settings.field_of_background_color = value;
					plugin.explorer.set_fileitem_style()
					await plugin.saveSettings();
				}));


		new Setting(containerEl)
			.setName(strings.setting_notice_while_modify_chain)
			.addToggle(text => text
				.setValue(settings.notice_while_modify_chain)
				.onChange(async (value) => {
					settings.notice_while_modify_chain = value;
					await plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName(strings.setting_refreshDataView)
			.addToggle(text => text
				.setValue(settings.refreshDataView)
				.onChange(async (value) => {
					settings.refreshDataView = value;
					await plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName(strings.setting_refreshTasks)
			.addToggle(text => text
				.setValue(settings.refreshTasks)
				.onChange(async (value) => {
					settings.refreshTasks = value;
					await plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName(strings.setting_wordcout)
			.addToggle(text => text
				.setValue(settings.wordcout)
				.onChange(async (value) => {
					settings.wordcout = value;
					await plugin.saveSettings();
					plugin.wordcount.register();
				})
			);

		new Setting(containerEl)
			.setName(strings.setting_wordcout_xfolder)
			.addTextArea(text => text
				.setValue(settings.wordcountxfolder)
				.onChange(async (value) => {
					settings.wordcountxfolder = value;
					await plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName(strings.setting_avata)
			.addTextArea(text => text
				.setValue(settings.avata)
				.onChange(async (value) => {
					settings.avata = value;
					await plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName(strings.setting_templater_tag)
			.addTextArea(text => text
				.setValue(settings.tpl_tags_folder)
				.onChange(async (value) => {
					settings.tpl_tags_folder = value;
					await plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName(strings.setting_httpServer_enabled)
			.setDesc(strings.setting_httpServer_enabled_desc)
			.addToggle(text => text
				.setValue(settings.httpServerEnabled)
				.onChange(async (value) => {
					settings.httpServerEnabled = value;
					await plugin.saveSettings();
					if (value) {
						await restartHttpServer(plugin);
					} else {
						await plugin.httpServer?.stop();
					}
				})
			);

		new Setting(containerEl)
			.setName(strings.setting_httpServer_https_enabled)
			.setDesc(strings.setting_httpServer_https_enabled_desc)
			.addToggle(text => text
				.setValue(settings.httpServerHttpsEnabled)
				.setDisabled(!settings.httpServerEnabled)
				.onChange(async (value) => {
					if (!value && !settings.httpServerHttpEnabled) {
						new Notice(strings.setting_httpServer_need_one_protocol);
						return;
					}
					settings.httpServerHttpsEnabled = value;
					await plugin.saveSettings();
					if (settings.httpServerEnabled) {
						await restartHttpServer(plugin);
					}
				})
			);

		new Setting(containerEl)
			.setName(strings.setting_httpServer_http_enabled)
			.setDesc(strings.setting_httpServer_http_enabled_desc)
			.addToggle(text => text
				.setValue(settings.httpServerHttpEnabled)
				.setDisabled(!settings.httpServerEnabled)
				.onChange(async (value) => {
					if (!value && !settings.httpServerHttpsEnabled) {
						new Notice(strings.setting_httpServer_need_one_protocol);
						return;
					}
					settings.httpServerHttpEnabled = value;
					await plugin.saveSettings();
					if (settings.httpServerEnabled) {
						await restartHttpServer(plugin);
					}
				})
			);
		
		new Setting(containerEl)
			.setName(strings.setting_httpServer_host)
			.setDesc(strings.setting_httpServer_host_desc)
			.addText(text => text
				.setValue(settings.httpServerHost.toString())
				.setDisabled(!settings.httpServerEnabled || !settings.httpServerHttpsEnabled)
				.onChange(async (value) => {
					settings.httpServerHost = value;
					await plugin.saveSettings();
					if (settings.httpServerEnabled) {
						await restartHttpServer(plugin);
					}
				}));

		new Setting(containerEl)
			.setName(strings.setting_httpServer_port)
			.setDesc(strings.setting_httpServer_port_desc)
			.addText(text => text
				.setValue(settings.httpServerPort.toString())
				.setDisabled(!settings.httpServerEnabled)
				.onChange(async (value) => {
					const port = parseInt(value) || 3000;
					settings.httpServerPort = port;
					await plugin.saveSettings();
					if (settings.httpServerEnabled) {
						await restartHttpServer(plugin);
					}
				}));
}


