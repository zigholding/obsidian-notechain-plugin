import {
	TFile, TFolder
} from 'obsidian';

export class NoteChainMisc {
	/** Host NoteChain fields/methods (filled by applyMixins). */
	[key: string]: any;


	async cmd_move_file_to_another_folder(tfile = this.current_note) {
		if (tfile == null) { return; }

		let folders = this.plugin.easyapi.file.get_all_folders();
		folders = this.sort_folders_by_mtime(folders
		).filter((f: TFolder) => f != tfile.parent);

		if (tfile.extension === 'md') {
			folders = folders.filter((f: TFile) => this.filter_user_ignore(f));
		}
		try {
			let folder = await this.plugin.easyapi.dialog_suggest(
				this.plugin.utils.array_prefix_id(
					folders.map((f: TFile) => f.path)
				), folders
			);
			// 移动笔记
			let dst = folder.path + "/" + tfile.basename + "." + tfile.extension;
			await this.app.fileManager.renameFile(tfile, dst);
		} catch (error) {

		}
	}

	filter_user_ignore(note: TFile) {
		if (!((this.app.vault as any).config.attachmentFolderPath === './')) {
			if (note.path.startsWith(
				(this.app.vault as any).config.attachmentFolderPath)
			) {
				return false;
			}
		}
		if ((this.app.vault as any).userIgnoreFilters) {
			for (let x of (this.app.vault as any).userIgnoreFilters) {
				if (note.path.startsWith(x)) {
					return false;
				}
			}
		}
		return true;
	}

	get_confluence_level(note: TFile) {
		let fm = this.plugin.editor.get_frontmatter(note, this.plugin.settings.field_of_confluence_tab_format);
		if (fm) {
			return (fm.match(/\t/g) || []).length;
		}
		return 0;
	}

}
