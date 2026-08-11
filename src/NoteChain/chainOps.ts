import {
	Notice,
	TFile, TFolder
} from 'obsidian';

export class NoteChainChainOps {
	/** Host NoteChain fields/methods (filled by applyMixins). */
	[key: string]: any;


	async chain_fill_folder_orphans(file: TFile, notes: TFile[]) {
		if (!file || notes.length === 0) { return false; }

		const noteSet = new Set(notes);
		const visited = new Set<TFile>();
		const chains: TFile[][] = [];
		for (const note of notes) {
			if (visited.has(note)) { continue; }
			const chain = this.get_chain_among(note, noteSet);
			for (const n of chain) { visited.add(n); }
			chains.push(chain);
		}

		if (chains.length === 1 && chains[0].length === notes.length) {
			return false;
		}

		let main =
			chains.find(c => c.length > 1 && c.includes(file)) ||
			chains.filter(c => c.length > 1).sort((a, b) => b.length - a.length)[0] ||
			[];

		const inMain = new Set(main);
		const orphans = notes
			.filter(n => !inMain.has(n))
			.sort((a, b) => a.name.localeCompare(b.name));

		if (main.length <= 1) {
			if (orphans.length <= 1) { return false; }
			await this.chain_concat_tfiles(orphans);
			return true;
		}

		if (orphans.length === 0) { return false; }

		for (const orphan of orphans) {
			await this.chain_pop_node(orphan);
			await this.chain_set_prev(orphan, null);
			await this.chain_set_next(orphan, null);
		}
		const tail = this.get_last_note(main[0]) || main[main.length - 1];
		await this.chain_concat_tfiles([tail, ...orphans]);
		return true;
	}

	async chain_set_prev(tfile: TFile, prev: TFile | null) {
		if (tfile == null || tfile == prev) { return; }
		if (this.get_prev_note(tfile) == prev) {
			if (prev == null) {
				if (this.plugin.editor.get_frontmatter(tfile, this.prev) != null) {
					await this.plugin.editor.set_frontmatter(
						tfile, this.prev, null
					)
				}
			}
			return;
		}
		let msg = `Note Chain: ${prev?.basename} --> 🏠${tfile.basename}`;
		if (prev == null) {
			await this.plugin.editor.set_frontmatter(
				tfile, this.prev, null
			);
		} else {
			await this.plugin.editor.set_frontmatter(
				tfile, this.prev, this.plugin.easyapi.file.get_link_of_file(prev)
			);
		}
		if (this.plugin.settings.notice_while_modify_chain) {
			new Notice(msg, 5000);
		}
	}

	async chain_set_next(tfile: TFile, next: TFile | null) {
		if (tfile == null || tfile == next) { return; }
		if (this.get_next_note(tfile) == next) {
			if (next == null) {
				if (this.plugin.editor.get_frontmatter(tfile, this.next) != null) {
					await this.plugin.editor.set_frontmatter(
						tfile, this.next, null
					)
				}
			}
			return;
		}
		let msg = `Note Chain: 🏠${tfile?.basename} <-- ${next?.basename}`;
		if (next == null) {
			await this.plugin.editor.set_frontmatter(
				tfile, this.next, null
			);
		} else {
			await this.plugin.editor.set_frontmatter(
				tfile, this.next, this.plugin.easyapi.file.get_link_of_file(next)
			);
		}
		if (this.plugin.settings.notice_while_modify_chain) {
			new Notice(msg, 5000);
		}
	}

	// 将 tfiles 移动为 anchor 的后置笔记
	async chain_set_next_files(tfiles: Array<TFile>, anchor: TFile | null, same_folder = true) {

		if (!tfiles) { return; }

		tfiles = tfiles.filter(x => x?.extension == 'md');
		if (tfiles.length == 0) { return; }

		if (!anchor) { return };

		if (tfiles.contains(anchor)) { return; }

		let xtfiles = this.sort_tfiles_by_chain(tfiles);


		// 移动文件，打断旧链
		for (let tfile of xtfiles) {
			if (anchor.parent) {
				if (same_folder && tfile.parent?.path != anchor.parent?.path) {
					let dst = anchor.parent.path + "/" + tfile.name;
					try {
						await this.app.fileManager.renameFile(tfile, dst);
					} catch (error) {
						// console.log(error)
					}

				}
				await this.chain_pop_node(tfile as TFile)
			}
		}

		tfiles.unshift(anchor)
		let anchor_next = this.get_next_note(anchor);
		if (anchor_next) { tfiles.push(anchor_next) }
		await this.chain_concat_tfiles(tfiles);
		for (let dst of tfiles.slice(1, tfiles.length - 1)) {
			await this.plugin.editor.set_frontmatter_align_file(
				anchor, dst, this.plugin.settings.field_of_confluence_tab_format
			)
		}
	}

	async chain_set_prev_next(tfile: TFile, prev: TFile, next: TFile) {
		if (tfile == null || prev == next || tfile == prev || tfile == next) { return; }

		if (this.get_prev_note(tfile) == prev) {
			await this.chain_set_next(tfile, next);
			return;
		}

		if (this.get_next_note(tfile) == next) {
			await this.chain_set_prev(tfile, prev);
			return;
		}

		let msg = `Note Chain: ${prev?.basename} --> 🏠${tfile?.basename} <-- ${next?.basename}`;
		let fm: { [key: string]: any } = {};
		fm[this.prev] = this.plugin.easyapi.file.get_link_of_file(prev);
		fm[this.next] = this.plugin.easyapi.file.get_link_of_file(next);
		await this.plugin.editor.set_multi_frontmatter(tfile, fm);
		if (this.plugin.settings.notice_while_modify_chain) {
			new Notice(msg, 5000);
		}
	}

	async chain_link_prev_next(prev: TFile, next: TFile) {
		await this.chain_set_prev(next, prev);
		await this.chain_set_next(prev, next);
	}

	async chain_concat_tfiles(tfiles: Array<TFile>) {
		// 清除自闭环
		let prev = this.get_prev_note(tfiles[0]);
		if (tfiles.contains(prev)) {
			await this.chain_set_prev(tfiles[0], null);
		}

		// 清除自闭环
		let next = this.get_next_note(tfiles[tfiles.length - 1]);
		if (tfiles.contains(next)) {
			await this.chain_set_next(tfiles[tfiles.length - 1], null);
		}
		if (tfiles.length <= 1) {
			return;
		}
		let N = tfiles.length;
		await this.chain_set_next(tfiles[0], tfiles[1]);
		await this.chain_set_prev(tfiles[N - 1], tfiles[N - 2]);
		for (let i = 1; i < tfiles.length - 1; i++) {
			await this.chain_set_prev_next(tfiles[i], tfiles[i - 1], tfiles[i + 1])
		}
	}

	async chain_pop_node(tfile: TFile) {
		let notes = this.get_neighbors(tfile);
		await this.chain_link_prev_next(notes[0], notes[1]);
	}

	async chain_insert_node_as_head(tfile: TFile, anchor: TFile) {
		let head = this.get_first_note(anchor);
		await this.chain_link_prev_next(tfile, head);
	}

	async chain_insert_node_as_tail(tfile: TFile, anchor: TFile) {
		let tail = this.get_last_note(anchor);
		await this.chain_link_prev_next(tail, tfile);
	}

	async chain_insert_node_after(tfile: TFile, anchor: TFile) {
		let anchor_next = this.get_next_note(anchor);
		if (anchor_next == tfile) { return; }

		let tfile_neighbor = this.get_neighbors(tfile);
		if (tfile_neighbor[1] == anchor) {
			await this.chain_concat_tfiles(
				[tfile_neighbor[0], anchor, tfile, anchor_next]
			);
		} else {
			await this.chain_pop_node(tfile);
			await this.chain_concat_tfiles([anchor, tfile, anchor_next]);
		}
	}

	async chain_insert_node_before(tfile: TFile, anchor: TFile) {
		let anchor_prev = this.get_prev_note(anchor);
		if (anchor_prev == tfile) { return; }
		let tfile_neighbor = this.get_neighbors(tfile);
		if (tfile_neighbor[0] == anchor) {
			await this.chain_concat_tfiles(
				[anchor_prev, tfile, anchor, tfile_neighbor[1]]
			);
		} else {
			await this.chain_pop_node(tfile);
			await this.chain_concat_tfiles([anchor_prev, tfile, anchor]);
		}
	}

	async chain_insert_folder_after(tfile: TFile, anchor: TFile) {
		if (!tfile.parent || tfile.parent.parent != anchor.parent) {
			return;
		}
		let note = this.plugin.easyapi.file.get_tfile(tfile.parent.name);
		if (!note) {
			return;
		}
		await this.plugin.editor.set_multi_frontmatter(
			note,
			{
				"FolderPrevNote": this.plugin.easyapi.file.get_link_of_file(anchor),
				"FolderPrevNoteOffset": 0.5,
			}
		)
	}

	async chain_suggester_tfiles(tfile = this.current_note, mode = 'suggester') {
		let notes = this.plugin.easyapi.file.get_brothers(tfile);
		if (notes.length == 0) { return; }

		let files = await this.suggester_sort(notes);
		await this.chain_concat_tfiles(files);
	}

}
