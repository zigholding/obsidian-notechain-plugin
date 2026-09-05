import {
	TFile, TFolder, App, TAbstractFile
} from 'obsidian';
import type NoteChainPlugin from '../plugin';
import type { NoteChain } from '../NoteChain';
import { vaultConfig, vaultUserIgnoreFilters } from '../obsidian-app';

export class NoteChainMisc {
	plugin!: NoteChainPlugin;
	app!: App;
	prev!: string;
	next!: string;
	children!: Record<string, TAbstractFile[]>;


	async cmd_move_file_to_another_folder(this: NoteChain, tfile = this.current_note) {
		if (tfile == null) { return; }

		let folders = this.plugin.easyapi.file.get_all_folders();
		folders = this.sort_folders_by_mtime(folders
		).filter((f: TFolder) => f != tfile.parent);

		if (tfile.extension === 'md') {
			folders = folders.filter((f: TFolder) => this.filter_user_ignore(f));
		}
		try {
			let folder = await this.plugin.easyapi.dialog_suggest(
				this.plugin.utils.array_prefix_id(
					folders.map((f: TFolder) => f.path)
				), folders
			);
			if (!(folder instanceof TFolder)) { return; }
			// 移动笔记
			let dst = folder.path + "/" + tfile.basename + "." + tfile.extension;
			await this.app.fileManager.renameFile(tfile, dst);
		} catch {
			// user cancelled folder picker or rename failed
		}
	}

	filter_user_ignore(this: NoteChain, note: TAbstractFile) {
		const attach = vaultConfig(this.app)?.attachmentFolderPath;
		if (!(attach === './')) {
			if (attach && note.path.startsWith(attach)) {
				return false;
			}
		}
		const ignore = vaultUserIgnoreFilters(this.app);
		if (ignore) {
			for (let x of ignore) {
				if (note.path.startsWith(x)) {
					return false;
				}
			}
		}
		return true;
	}

	get_confluence_level(this: NoteChain, note: TFile) {
		let fm = this.plugin.editor.get_frontmatter(note, this.plugin.settings.notechain.field_of_confluence_tab_format);
		if (typeof fm === 'string') {
			return (fm.match(/\t/g) || []).length;
		}
		return 0;
	}

}
