import { 
	App, PluginSettingTab, Setting,Plugin
} from 'obsidian';

import NoteChainPlugin from '../main';


export interface NCSettings {
	PrevChain:string;
	NextChain:string;
	auto_notechain:boolean;
	refreshDataView:boolean;
	refreshTasks:boolean,
	isSortFileExplorer:boolean,
	isFolderFirst:boolean,
	suggesterNotesMode:string,
	wordcout:boolean,
	wordcountxfolder:string,
	modal_default_width: number,
    modal_default_height: number,
}

export const DEFAULT_SETTINGS: NCSettings = {
	PrevChain : "10",
	NextChain : "10",
	auto_notechain : false,
	refreshDataView : true,
	refreshTasks : true,
	isSortFileExplorer : true,
	isFolderFirst : true,
	suggesterNotesMode:'',
	wordcout:true,
	wordcountxfolder:'',
	modal_default_width: 800,
    modal_default_height: 600,
}


export class NCSettingTab extends PluginSettingTab {
	plugin: NoteChainPlugin;

	constructor(app: App, plugin: NoteChainPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

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
				.addOption('item_get_brothers',this.plugin.strings.item_get_brothers)
				.addOption('item_uncle_notes',this.plugin.strings.item_uncle_notes)
				.addOption('item_notechain',this.plugin.strings.item_notechain)
				.addOption('item_same_folder',this.plugin.strings.item_same_folder)
				.addOption('item_inlinks_outlinks',this.plugin.strings.item_inlinks_outlinks)
				.addOption('item_inlins',this.plugin.strings.item_inlins)
				.addOption('item_outlinks',this.plugin.strings.item_outlinks)
				.addOption('item_all_noes',this.plugin.strings.item_all_noes)
				.addOption('item_recent',this.plugin.strings.item_recent)
				.addOption('','')

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
				.setName(this.plugin.strings.setting_modal_size)
				.setDesc(this.plugin.strings.setting_modal_width)
				.addText(text => text
					.setPlaceholder("800")
					.setValue(this.plugin.settings.modal_default_width.toString())
					.onChange(async (value) => {
						this.plugin.settings.modal_default_width = parseInt(value) || 800;
						await this.plugin.saveSettings();
				}));
	
			new Setting(containerEl)
				.setName("")
				.setDesc(this.plugin.strings.setting_modal_height)
				.addText(text => text
					.setPlaceholder("600")
					.setValue(this.plugin.settings.modal_default_height.toString())
					.onChange(async (value) => {
						this.plugin.settings.modal_default_height = parseInt(value) || 600;
						await this.plugin.saveSettings();
				}));

		
	}
}
