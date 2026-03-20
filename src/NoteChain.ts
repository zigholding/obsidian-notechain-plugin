
import {
	App, Editor, MarkdownView, Modal, Notice,
	Plugin, PluginSettingTab, Setting, moment, MarkdownRenderer, Component,
	TAbstractFile,
	TFile, TFolder
} from 'obsidian';

import NoteChainPlugin from "../main";
import { get_tp_func } from './utils';
import { NoteContentModal, NoteEditorModal } from './NCModal'
import { NoteContentView } from './NCView'
import { LexoRank } from "lexorank";
import { strings } from './strings';
import { off } from 'process';



export class NoteChain {
	plugin: NoteChainPlugin;
	app: App;
	prev: string;
	next: string;
	fid: string;
	nid: string;
	children: { [key: string]: any };
	NoteEditorModal: any
	LexoRank: any;

	constructor(plugin: NoteChainPlugin,
		prev = "PrevNote", next = "NextNote",
		nid = "lexorank", fid = 'lexorank_folder'
	) {
		this.plugin = plugin;
		this.app = plugin.app;
		(window as any).nc = this.plugin;

		this.NoteEditorModal = NoteEditorModal
		this.LexoRank = LexoRank;

		this.prev = prev;
		this.next = next;
		this.nid = nid;
		this.fid = fid;
		this.init_children();

	}

	children_as_chain(root = '/'): TAbstractFile[] {
		let items = []
		for (let k of this.children[root]) {
			items.push(k)
			if (k instanceof TFolder) {
				let sitems = this.children_as_chain(k.path);
				for (let i of sitems) {
					items.push(i)
				}
			}
		}
		return items;
	}

	async open_note_in_modal(notePath: string) {
		try {
			let file = this.plugin.easyapi.file.get_tfile(notePath);
			if (file instanceof TFile) {
				let content = await this.app.vault.read(file);
				let modal = new NoteContentModal(this.app, content, this.plugin, file.path);
				modal.open();
				return modal;
			} else {
				let modal = new NoteContentModal(this.app, notePath, this.plugin, '');
				modal.open();
				return modal;
			}
		} catch (error) {
			new Notice(`Error opening note in modal: ${error.message}`);
		}
	}

	async open_note_in_view(notePath: string) {
		try {

			let content = '';
			let sourcePath = '';
			let noteIcon = 'puzzle';
			let displayText = 'Note Preview';
			let file = this.plugin.easyapi.file.get_tfile(notePath);
			if (file instanceof TFile) {
				displayText = file.basename; // 使用文件名（不含扩展名）作为显示文本
				if(file.extension==='base'){
					noteIcon = 'database';
				}else if(file.extension==='canvas'){
					noteIcon = 'paintbrush';
				}else{
					content = await this.app.vault.read(file);
					sourcePath = notePath;
					// 预先读取frontmatter中的icon
					const iconFromFrontmatter = this.plugin.editor.get_frontmatter(file, 'icon');
					if (iconFromFrontmatter && typeof iconFromFrontmatter === 'string') {
						noteIcon = iconFromFrontmatter;
					}

					const displayTextFromFrontmatter = this.plugin.editor.get_frontmatter(file, 'display');
					if (displayTextFromFrontmatter && typeof displayTextFromFrontmatter === 'string') {
						displayText = displayTextFromFrontmatter;
					}
				}
			} else {
				content = notePath;
				// 如果不是文件，使用路径的最后一部分作为显示文本
				displayText = notePath.split('/').pop() || notePath.split('\\').pop() || 'Note Preview';
			}
			let leaf = this.app.workspace.getRightLeaf(false); // 右侧打开
			if (!leaf) { return }
			await leaf.setViewState({
				type: 'note-content-view',
				active: true,
				state: {
					content: content,
					sourcePath: sourcePath,
					noteIcon: noteIcon,
					displayText: displayText
				}
			});
			let view = leaf.view as NoteContentView;

			view.setContent(content, sourcePath);
		} catch (error) {
			new Notice(`Error opening note in modal: ${error.message}`);
		}
	}

	init_children() {
		this.children = {};
		for (let f of this.plugin.easyapi.file.get_all_folders()) {
			let tfiles = f.children;
			if (this.plugin.explorer?.file_explorer) {
				tfiles = this.sort_tfiles(
					tfiles,
					(this.plugin.explorer.file_explorer as any).sortOrder
				);
			}
			(this.children as any)[f.path] = this.sort_tfiles_by_chain(tfiles);
		}
	}

	refresh_folder(tfolder: TFolder) {
		if (tfolder?.children) {
			let tfiles = tfolder.children;
			if (this.plugin.explorer.file_explorer) {
				tfiles = this.sort_tfiles(
					tfiles as any,
					(this.plugin.explorer.file_explorer as any).sortOrder
				);
			}
			this.children[tfolder.path] = this.sort_tfiles_by_chain(
				tfiles
			);
		}
	}

	refresh_tfile(tfile: TAbstractFile) {
		if (tfile.parent?.children) {
			this.refresh_folder(tfile.parent);
		}
	}

	get tp_find_tfile() {
		return get_tp_func(this.app, 'tp.file.find_tfile');
	}

	get tp_suggester() {
		return get_tp_func(this.app, 'tp.system.suggester');
	}

	get tp_prompt() {
		return get_tp_func(this.app, 'tp.system.prompt');
	}

	sort_folders_by_mtime(folders: Array<TFolder>, reverse = true) {
		function ufunc(f: TFolder) {
			return Math.max(
				...f.children.filter((f: TFile) => f.basename).map((f: TFile) => f.stat
					.mtime)
			)
		}
		let res = folders.sort((a, b) => ufunc(a) - ufunc(b));
		if (reverse) {
			res = res.reverse();
		}
		return res;
	}

	async cmd_move_file_to_another_folder(tfile = this.current_note) {
		if (tfile == null) { return; }

		let folders = this.plugin.easyapi.file.get_all_folders();
		folders = this.sort_folders_by_mtime(folders
		).filter(f => f != tfile.parent);

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

	async sugguster_note(notes: null | Array<TFile> = null, slice = 0, onlyname = false) {
		// 从库中选择一个笔记
		if (notes == null) {
			notes = this.sort_tfiles(
				this.app.vault.getFiles(),
				['mtime', 'x']
			).filter((f: TFile) => this.filter_user_ignore(f));
		}
		try {
			let items;
			if (onlyname) {
				items = (notes as any).map((f: TFile) => f.basename)
			} else {
				items = (notes as any).map((f: TFile) => f.path.slice(slice))
			}
			let msg = this.plugin.utils.array_prefix_id(items);
			let note = await this.plugin.easyapi.dialog_suggest(msg, notes);
			return note;
		} catch (error) {
			return null;
		}
	}

	open_note(tfile: TFile, revealFolder = false, collapse = true) {
		if (tfile) {
			this.app.workspace.getLeaf().openFile(tfile);

			if (revealFolder) {
				if (collapse) {
					(this.plugin.explorer.file_explorer as any).tree.setCollapseAll(true);
				}
				(this.plugin.explorer.file_explorer as any).revealInFolder(tfile);
			}
		}
	}

	async sugguster_open_note() {
		try {
			let note = await this.sugguster_note();
			this.open_note(note);
		} catch (error) {
		}
	}

	get_recent_tfiles(only_md = true): Array<TFile> {
		let recent = (this.app as any).plugins.getPlugin('recent-files-obsidian');
		if (recent) {
			let files = recent.data.recentFiles.map(
				(x: any) => this.plugin.easyapi.file.get_tfile(x.path)
			).filter((x: any) => x)
			return files
		} else {
			let recent = []
			let files = (this.app.workspace as any).recentFileTracker?.lastOpenFiles
			if (files && files.length > 0) {
				recent = files.map((x: string) => this.plugin.easyapi.file.get_tfile(x)).filter((x: TFile) => x)
			}
			let tfile = this.app.workspace.getActiveFile()
			if (tfile) {
				recent.unshift(tfile)
			}
			if (only_md) {
				recent = recent.filter((x: TFile) => x.extension == 'md')
			}
			return recent
		}
	}

	get_last_daily_note(recent_first = true) {
		let pattern = /^\d{4}-\d{2}-\d{2}$/;

		if (recent_first) {
			let recent = this.get_recent_tfiles()
			for (let tfile of recent) {
				if (tfile.basename.match(pattern)) {
					return tfile;
				}
			}
		}

		let t = moment()
		for (let i = 0; i < 20; i++) {
			let xt = t.clone().add(-i, 'days')
			// 库中所有文件
			let fname = xt.format('YYYY-MM-DD');
			let tfile = this.plugin.easyapi.file.get_tfile(fname);
			if (tfile) {
				return tfile;
			}
		}

		let files = this.app.vault.getMarkdownFiles().filter(
			(x: TFile) => x.basename.match(pattern)
		);
		files = this.sort_tfiles(files, 'name');
		if (files.length > 0) {
			return files[files.length - 1];
		}
		return null;
	}

	get_neighbor_leaf(offset = 1) {
		let app = this.plugin.app
		let leaves = app.workspace.getLeavesOfType('markdown');
		let activeLeaf = app.workspace.getActiveViewOfType(MarkdownView);
		if (activeLeaf) {
			let idx = leaves.map(x => x.view == activeLeaf).indexOf(true);
			idx = idx + offset;
			if (idx < 0 || idx > leaves.length - 1) {
				return null;
			}
			return leaves[idx];
		}
	}

	get_last_activate_file(only_md = true, skip_conote = true) {
		let tfiles = this.get_recent_tfiles(only_md);
		for (let tfile of tfiles) {
			if (skip_conote && this.plugin.easyapi.file.get_tags(tfile).contains('#conote')) {
				continue;
			}
			return tfile;
		}
		return null;
	}

	get_last_activate_leaf(skip_conote = true) {
		let leaves: Array<any> = this.app.workspace.getLeavesOfType('markdown');
		leaves = leaves.filter(x => x.getViewState().state.file);
		leaves = leaves.sort((a, b) => b.activeTime - a.activeTime);

		for (let leaf of leaves) {
			let file = leaf.getViewState().state.file;
			if (skip_conote && this.plugin.easyapi.file.get_tags(file).contains('#conote')) {
				continue;
			}
			return leaf;
		}

		let leaf = null;
		for (let i of [1, -1, 0]) {
			leaf = this.plugin.chain.get_neighbor_leaf(i);
			if (leaf) {
				return leaf;
			}
		}
		return null;
	}

	get current_note(): TFile | null {
		return this.app.workspace.getActiveFile();
	}

	indexOfFolder(tfile: TFolder, tfiles: Array<TFile>) {
		let info = this.get_folder_pre_info(tfile);

		let idx = -1;
		let anchor = this.plugin.easyapi.file.get_tfile(info['prev']);
		if (anchor) {
			idx = tfiles.indexOf(anchor)
		}

		let offset = info['offset']
		if (typeof (offset) == 'string') {
			idx = idx + parseFloat(offset);
		} else {
			idx = idx + offset;
		}
		return idx;
	}

	tfile_to_string(tfile: TFile) {
		let curr = this.current_note;
		let msg = '';
		if (tfile.parent == curr?.parent) {
			msg = tfile.basename;
		} else {
			msg = tfile.path;
		}
		if (tfile == this.current_note) {
			return `🏠 ${msg}`
		} else {
			return msg;
		}

	}

	async suggester_notes(tfile = this.current_note, curr_first = false, smode = '') {
		if (tfile) { tfile == this.current_note; }
		let kv = [
			this.plugin.strings.item_get_brothers,
			this.plugin.strings.item_notechain,
			this.plugin.strings.item_uncle_notes,
			this.plugin.strings.item_same_folder,
			this.plugin.strings.item_inlinks_outlinks,
			this.plugin.strings.item_inlins,
			this.plugin.strings.item_outlinks,
			this.plugin.strings.item_all_noes,
			this.plugin.strings.item_recent,
		]

		if (curr_first) {
			kv.unshift(this.plugin.strings.item_currentnote)
		} else {
			kv.push(this.plugin.strings.item_currentnote)
		}

		let mode = '';
		if (kv.contains(smode)) {
			mode = smode;
		} else {
			mode = await this.plugin.easyapi.dialog_suggest(this.plugin.utils.array_prefix_id(kv), kv);
		}
		if (mode === this.plugin.strings.item_currentnote) {
			return [tfile];
		} else if (mode === this.plugin.strings.item_get_brothers) {
			return this.plugin.easyapi.file.get_brothers(tfile);
		} else if (mode === this.plugin.strings.item_same_folder) {
			if (tfile?.parent) {
				return this.plugin.easyapi.file.get_tfiles_of_folder(tfile.parent, -1);
			}
		} else if (mode === this.plugin.strings.item_inlinks_outlinks) {
			return this.plugin.easyapi.file.get_links(tfile);
		} else if (mode === this.plugin.strings.item_inlins) {
			return this.plugin.easyapi.file.get_inlinks(tfile);
		} else if (mode === this.plugin.strings.item_outlinks) {
			return this.plugin.easyapi.file.get_outlinks(tfile);
		} else if (mode === this.plugin.strings.item_all_noes) {
			return this.plugin.easyapi.file.get_all_tfiles();
		} else if (mode === this.plugin.strings.item_recent) {
			return this.get_recent_tfiles()
		} else if (mode === this.plugin.strings.item_uncle_notes) {
			if (tfile) {
				return this.plugin.easyapi.file.get_uncles(tfile);
			}
		} else if (mode === this.plugin.strings.item_notechain) {
			return this.get_chain(
				tfile,
				Number(this.plugin.settings.PrevChain),
				Number(this.plugin.settings.NextChain)
			);
		} else {
			return [];
		}
	}


	// Chain
	get_prev_note(tfile = this.current_note, across = false) {
		if (!tfile) { return; }
		if ((tfile as any).deleted) {
			let tfiles = this.app.vault.getMarkdownFiles();

			tfiles = tfiles.filter(f => {
				if (!f) {
					return false
				}
				let next = this.plugin.editor.get_frontmatter(f, this.next)
				if (typeof (next) != 'string') {
					return false
				}
				return `[[${tfile.basename}]]` == next
			})

			if (tfiles.length > 0) {
				return tfiles[0];
			} else {
				return null;
			}
		} else {
			let name = this.plugin.editor.get_frontmatter(tfile, this.prev);
			let note = this.plugin.easyapi.file.get_tfile(name);
			if (!note && across) {// 不存在时，获取文件列表中的下一个文件
				let chain = this;
				function _prev_(tfile: TAbstractFile):(TAbstractFile|any) {
					if (tfile.parent) {
						let tfiles = chain.children[tfile.parent.path];
						let idx = tfiles.indexOf(tfile);
						// 在当前目录下搜索
						while (idx > 0) {
							let cnote = chain.get_1st_note(tfiles[idx - 1], true);
							if (cnote) {
								return cnote;
							} else {
								idx = idx - 1
							}
						}
						return _prev_(tfile.parent);
					}
					return null;
				}
				note = _prev_(tfile);
			}
			return note ? note : null;
		}
	}

	open_prev_notes(tfile = this.current_note) {
		let note = this.get_prev_note(tfile, true);
		this.open_note(note);
	}

	get_next_note(tfile = this.current_note, across = false) {
		if (!tfile) { return null; }
		if ((tfile as any).deleted) {
			let tfiles = this.app.vault.getMarkdownFiles();
			let prev =
				tfiles = tfiles.filter(f => {
					if (!f) {
						return false
					}
					let prev = this.plugin.editor.get_frontmatter(f, this.prev)
					if (typeof (prev) != 'string') {
						return false
					}
					return `[[${tfile.basename}]]` == prev
				});
			if (tfiles.length > 0) {
				return tfiles[0];
			} else {
				return null;
			}
		} else {
			let name = this.plugin.editor.get_frontmatter(tfile, this.next);
			// 根据元数据获取后置笔记
			let note = this.plugin.easyapi.file.get_tfile(name);
			if (!note && across) {// 不存在时，获取文件列表中的下一个文件
				let chain = this;
				function _next_(tfile: TAbstractFile):(TAbstractFile|any) {
					if (tfile.parent) {
						let tfiles = chain.children[tfile.parent.path];
						let idx = tfiles.indexOf(tfile);
						// 在当前目录下搜索
						while (idx < tfiles.length - 1) {
							let cnote = chain.get_1st_note(tfiles[idx + 1], false);
							if (cnote) {
								return cnote;
							} else {
								idx = idx + 1
							}
						}
						return _next_(tfile.parent);
					}
					return null;
				}
				note = _next_(tfile);
			}
			return note ? note : null;
		}
	}

	get_1st_note(tfile: TAbstractFile, last = false): TFile | undefined {
		if (tfile instanceof TFile) {
			return tfile;
		} else if (tfile instanceof TFolder) {
			let tfiles = this.children[tfile.path];
			if (tfiles.length == 0) { return undefined }
			if (last) {
				return this.get_1st_note(tfiles[tfiles.length - 1], last)
			} else {
				return this.get_1st_note(tfiles[0])
			}
		}
	}

	open_next_notes(tfile = this.current_note) {
		let note = this.get_next_note(tfile, true);
		this.open_note(note);
	}

	get_chain(tfile = this.current_note, prev = 10, next = 10, with_self = true,across=false) {
		if (tfile == null) { return []; }

		let res = new Array();
		if (with_self) {
			res.push(tfile);
		}

		let tmp = tfile;
		for (let i = prev; i != 0; i--) {
			let note = this.get_prev_note(tmp,across);
			if (!note) {
				break;
			} else if (res.includes(note)) {
				break;
			} else {
				res.unshift(note);
				tmp = note;
			}
		}

		tmp = tfile;
		for (let i = next; i != 0; i--) {
			let note = this.get_next_note(tmp,across);
			if (!note) {
				break;
			} else if (res.includes(note)) {
				break;
			} else {
				res.push(note);
				tmp = note;
			}
		}
		return res;
	}

	get_first_note(tfile = this.current_note) {
		let notes = this.get_chain(tfile, -1, 0, false);
		if (notes.length > 0) {
			return notes[0];
		} else {
			return null;
		}
	}

	get_last_note(tfile = this.current_note) {
		let notes = this.get_chain(tfile, 0, -1, false);
		if (notes.length > 0) {
			return notes[notes.length - 1];
		} else {
			return null;
		}
	}

	get_neighbors(tfile = this.current_note) {
		return [
			this.get_prev_note(tfile),
			this.get_next_note(tfile),
		]
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
				tfile, this.prev, this.get_link_of_file(prev)
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
				tfile, this.next, this.get_link_of_file(next)
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

	get_link_of_file(tfile: TFile) {
		if (!tfile) { return null }
		let tfiles = this.plugin.easyapi.file.get_tfile(tfile.name, false);
		if (tfiles.length > 1) {
			if (tfile.extension == 'md') {
				return `[[${tfile.path.slice(0, tfile.path.length - tfile.extension.length - 1)}]]`;
			} else {
				return `[[${tfile.path}]]`;
			}
		} else {
			if (tfile.extension == 'md') {
				return `[[${tfile.basename}]]`;
			} else {
				return `[[${tfile.name}]]`;
			}
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
		fm[this.prev] = this.get_link_of_file(prev);
		fm[this.next] = this.get_link_of_file(next);
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
				"FolderPrevNote": this.get_link_of_file(anchor),
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

	sort_tfiles(files: Array<TFile>, field: any): any {
		if (typeof field === 'string') {
			if (field === 'name' || field === 'alphabetical') {
				return files.sort(
					(a, b) => (a.name.localeCompare(b.name))
				);
			} else if (field === 'mtime' || field === 'byModifiedTime') {
				return files.sort(
					(a, b) => (a.stat?.mtime - b.stat?.mtime)
				)
			} else if (field === 'ctime' || field === 'byCreatedTime') {
				return files.sort(
					(a, b) => (a.stat?.ctime - b.stat?.ctime)
				)
			} else if (field === 'alphabeticalReverse') {
				return files.sort(
					(b, a) => (a.name.localeCompare(b.name))
				);
			} else if (field === 'byModifiedTimeReverse') {
				return files.sort(
					(b, a) => (a.stat?.mtime - b.stat?.mtime)
				)
			} else if (field === 'byCreatedTimeReverse') {
				return files.sort(
					(b, a) => (a.stat?.ctime - b.stat?.ctime)
				)
			} else if (field === 'chain') {
				return this.sort_tfiles_by_chain(files);
			}
			return files;
		} else if (typeof field === 'object') {
			if (field instanceof Array) {
				let nfiles = this.sort_tfiles(files, field[0]);
				if (field.length >= 2) {
					if (field[1] === 'x') {
						return nfiles.reverse()
					}
				}
				return nfiles;
			}
		}
		return files;
	}

	sort_tfiles_by_chain(tfiles: Array<TAbstractFile>) {
		// 1️⃣ 计算基准顺序：如果这些文件都在同一个文件夹下，
		//    就使用该文件夹在 children 里已有的顺序作为“原始顺序”。
		let baseOrder: TAbstractFile[] | null = null;
		if (tfiles.length > 0) {
			const parentPaths = new Set(
				tfiles
					.map(f => f.parent?.path)
					.filter((p): p is string => !!p)
			);
			if (parentPaths.size === 1) {
				const p = Array.from(parentPaths)[0];
				if (this.children[p]) {
					baseOrder = this.children[p];
				}
			}
		}

		let notes = tfiles.filter(f => f instanceof TFile ) as TFile[];

		if (baseOrder) {
			const indexOfInBase = (f: TAbstractFile) => {
				const idx = baseOrder!.indexOf(f);
				return idx >= 0 ? idx : Number.MAX_SAFE_INTEGER;
			};
			notes = notes.sort((a, b) => indexOfInBase(a) - indexOfInBase(b));
		}
		
		let res: TAbstractFile[] = [];
		let ctfiles: TFile[] = [];
		while (notes.length > 0) {
			let note = notes[0];
			if (note instanceof TFile) {
				let xchain = this.get_chain(note, -1, -1);
				for (let x of xchain) {
					if (notes.contains(x)) {
						ctfiles.push(x);
						notes.remove(x);
					}
				}
			}
		}

		res.push(...ctfiles);
		let canvas = res.filter(f => (f instanceof TFile) && (['canvas','base'].contains(f.extension)))
		res = res.filter(f => (f instanceof TFile) && (!['canvas','base'].contains(f.extension)))
		let folders = tfiles.filter(f => f instanceof TFolder);
		if (folders.length > 0) {
			let idxs = folders.map(
				(f: TFolder) => this.indexOfFolder(f, ctfiles)
			);
			res.push(...folders);
			function indexOf(f: TAbstractFile) {
				if (f instanceof TFile) {
					return res.indexOf(f);
				} else if (f instanceof TFolder) {
					return idxs[folders.indexOf(f)];
				} else {
					return -1;
				}
			}
			res = res.sort((a, b) => indexOf(a) - indexOf(b));
		}

		for (let tfile of canvas) {
			let rname = res.map(x => x instanceof TFolder ? x.name : (x as TFile).basename);
			let cname = (tfile as TFile).basename;
			let idx = rname.indexOf(cname);
			if (idx < 0) {
				idx = rname.indexOf(cname.split('.').slice(0, -1).join('.'));
			}
			if (idx < 0) {
				res.push(tfile);
			} else {
				res.splice(idx + 1, 0, tfile);

			}
		}
		return res;
	}

	sort_tfiles_folder_first(tfiles: Array<TFile>) {
		let A = tfiles.filter(f => f instanceof TFolder).sort((a, b) => (a.name.localeCompare(b.name)));
		let B = tfiles.filter(f => f instanceof TFile);
		return this.plugin.utils.concat_array([A, B]);
	}

	sort_tfiles_by_field(tfiles: Array<TFile>, field: string) {
		let res = tfiles.sort(
			(a, b) => {
				let av = this.plugin.editor.get_frontmatter(a, field);
				let bv = this.plugin.editor.get_frontmatter(b, field);
				if (typeof (av) != typeof (bv)) {
					return 0
				}
				if (typeof (av) == 'number' && typeof (bv) == 'number') {
					return av - bv;
				}
				if (typeof (av) == 'string' && typeof (bv) == 'string') {
					let v = (av as string).localeCompare(bv as string)
					return v
				}
				return 0
			}
		)
		return res;
	}

	async suggester_sort(tfiles: Array<TFile>) {
		if (!tfiles) { return []; }
		if (tfiles.length == 0) { return [] };
		let kv = {
			'chain': 'chain',
			'name (a to z)': 'name',
			'ctime (old to new)': 'ctime',
			'mtime (old to new)': 'mtime',
			'name (z to a)': ['name', 'x'],
			'ctime (new to old)': ['ctime', 'x'],
			'mtime (new to old)': ['mtime', 'x'],
		}
		let field = await this.plugin.easyapi.dialog_suggest(
			Object.keys(kv),
			Object.values(kv)
		);
		if (field == null) { return []; }
		if (field == 'chain') {
			tfiles = this.sort_tfiles(tfiles, 'name');
		}
		return this.sort_tfiles(tfiles, field);
	}

	view_sort_by_chain() {
		let view = this.app.workspace.getLeavesOfType(
			"file-explorer"
		)[0]?.view as any;
		if (!view) { return; }
		view.sort();
		if (view.ready) {
			for (let path in view.fileItems) {
				let item = view.fileItems[path];
				if (item.vChildren) {
					let files = item.vChildren._children.map((f: any) => f.file);
					files = this.sort_tfiles_by_chain(files);
					let children = item.vChildren._children.sort(
						(a: any, b: any) => files.indexOf(a.file) - files.indexOf(b.file)
					)
					item.vChildren.setChildren(children);
				}
			}
			view.tree.infinityScroll.compute()
		}
	}

	async get_file_links(tfile: TFile, xlinks = true, inlinks = true, outlinks = true, onlymd = false) {
		let items: { [key: string]: any } = {}

		if (!tfile) {
			return items;
		}

		items['🏠 ' + tfile.basename] = (this.app.vault.adapter as any).getFullPath(tfile.path)
		if (xlinks) {
			let tmp;
			tmp = this.plugin.editor.get_frontmatter(tfile, 'github');
			if (tmp) {
				if (tmp.contains('github.com')) {
					items['🌐github'] = tmp;
				} else {
					items['🌐github'] = `https://github.com/` + tmp;
				}
			}
			tmp = this.plugin.editor.get_frontmatter(tfile, 'huggingface');
			if (tmp) {
				if (tmp.contains('huggingface.co')) {
					items['🌐huggingface🤗'] = tmp;
				} else {
					items['🌐huggingface🤗'] = `https://huggingface.co/` + tmp;
				}
			}
			tmp = this.plugin.editor.get_frontmatter(tfile, 'arxiv');
			if (tmp?.ID) {
				items['🌐arxiv'] = `https://arxiv.org/abs/` + tmp?.ID;
			}


			let text = await this.app.vault.cachedRead(tfile)
			// 匹配外部链接
			const regex = /\[[^(\[\])]*?\]\(.*?\)/g;
			const matches = text.match(regex);
			if (matches) {
				for (const match of matches) {
					// 提取匹配的组
					let key = match.slice(1, match.indexOf(']('));
					let value = match.slice(match.indexOf('](')).slice(2, -1);
					if (value === '') { continue; }
					if (key === '') {
						key = value;
					}
					if (value.startsWith('http')) {
						key = '🌐 ' + key;
					} else if (value.startsWith('file:///')) {
						value = value.slice(8)
						key = '📁 ' + key;
					} else {
						key = '🔗 ' + key;
					}
					items[key] = value;
				}
			}
		}
		if (inlinks) {
			let links = this.plugin.easyapi.file.get_inlinks(tfile, false);
			for (let i of links) {
				if (onlymd && !(i.extension === 'md')) { continue; }
				if (i.extension === 'md') {
					items['ℹ️ ' + i.basename] = (this.app.vault.adapter as any).getFullPath(i.path);
				} else {
					items['ℹ️ ' + i.name] = (this.app.vault.adapter as any).getFullPath(i.path);
				}
			}
		}
		if (outlinks) {
			let links = this.plugin.easyapi.file.get_outlinks(tfile, false);
			for (let i of links) {
				if (onlymd && !(i.extension === 'md')) { continue; }
				if (i.extension === 'md') {
					items['🅾️ ' + i.basename] = (this.app.vault.adapter as any).getFullPath(i.path);
				} else {
					items['🅾️ ' + i.name] = (this.app.vault.adapter as any).getFullPath(i.path);
				}
			}
		}
		items['💒 vault'] = (this.app.vault.adapter as any).getFullPath('.');
		return items;
	}

	get_folder_pre_info(tfolder: TFolder) {
		let note = this.plugin.easyapi.file.get_tfile(tfolder.path + '/' + tfolder.name + '.md');
		if (!note) {
			return {
				'prev': null,
				'offset': 0.0,
			};
		}
		let info = {
			'prev': this.plugin.editor.get_frontmatter(note, 'FolderPrevNote'),
			'offset': this.plugin.editor.get_frontmatter(note, 'FolderPrevNoteOffset'),
		}
		if (info['offset'] == null) {
			info['offset'] = 0.0;
		}
		return info;
	}

	async set_folder_pre_info(tfolder: TFolder, prev: string | TFile, offset: number) {
		let tfile = await this.get_folder_note(tfolder);
		let anchor = prev instanceof TFile ? prev : this.plugin.easyapi.file.get_tfile(prev);
		if (anchor) {
			await this.plugin.editor.set_multi_frontmatter(
				tfile,
				{
					"FolderPrevNote": this.get_link_of_file(anchor),
					"FolderPrevNoteOffset": offset,
				}
			)
		} else {
			await this.plugin.editor.set_multi_frontmatter(
				tfile,
				{
					"FolderPrevNote": null,
					"FolderPrevNoteOffset": offset,
				}
			)
		}
	}

	async reset_offset_of_folder(tfolder: TFolder) {
		let prev = this.get_folder_pre_info(tfolder);
		if (prev['offset'] == null) {
			return;
		}

		let tfolders = tfolder.parent?.children.filter((x: TAbstractFile) => x instanceof TFolder);
		let folders: any[] = [];
		if (tfolders) {
			for (let x of tfolders) {
				let info = this.get_folder_pre_info(x as TFolder);
				if (info['prev'] == prev['prev']) {
					folders.push(x);
				}
			}
		}
		folders = folders.sort((a, b) => {
			let ainfo = this.get_folder_pre_info(a as TFolder);
			let binfo = this.get_folder_pre_info(b as TFolder);
			return ainfo['offset'] - binfo['offset'];
		});

		if (folders.length == 0) { return }

		let base = Math.pow(0.1, Math.ceil(Math.log10(folders.length + 1)) + 1);
		let offset = 0.5 - base;
		for (let folder of folders) {
			offset = offset + base;
			await this.set_folder_pre_info(folder, prev['prev'], offset);
		}
	}

	async get_folder_note(tfolder: TFolder, create = true) {
		let note = this.plugin.easyapi.file.get_tfile(tfolder.path + '/' + tfolder.name + '.md');
		if (!note && create) {
			note = await this.app.vault.create(tfolder.path + '/' + tfolder.name + '.md', '');
		}
		return note;
	}

	async move_folder_as_next_note(tfolder: TFolder, anchor: TFolder | TFile) {
		if (anchor instanceof TFolder) {
			let prev = this.get_folder_pre_info(anchor);
			await this.set_folder_pre_info(tfolder, prev['prev'], prev['offset'] * 1.001);
		} else if (anchor instanceof TFile) {
			let prevs: any[] = [];
			let tfolders = tfolder.parent?.children.filter((x: TAbstractFile) => x instanceof TFolder && x != tfolder);
			if (tfolders) {
				for (let x of tfolders) {
					let info = await this.get_folder_pre_info(x as TFolder);
					prevs.push(info);
				}
			}
			prevs = prevs.filter(x => x['prev'] && this.plugin.easyapi.file.get_tfile(x['prev']) == anchor).map(x => x['offset']);
			if (prevs.length == 0) {
				this.set_folder_pre_info(tfolder, anchor, 0.5);
			} else {
				this.set_folder_pre_info(tfolder, anchor, Math.min(...prevs) * 1.001)
			}
		}
		await this.reset_offset_of_folder(tfolder);
	}

	get_confluence_level(note: TFile) {
		let fm = this.plugin.editor.get_frontmatter(note, this.plugin.settings.field_of_confluence_tab_format);
		if (fm) {
			return (fm.match(/\t/g) || []).length;
		}
		return 0;
	}

	lexorank_init_keys(N: number): string[] {
		if (N <= 0) return [];
	
		let min = LexoRank.min();
		let max = LexoRank.max();
	
		let result: string[] = [];
	
		function divide(left: LexoRank, right: LexoRank, n: number) {
			if (n <= 0) return;
	
			// 取中点
			let mid = left.between(right);
			result.push(mid.toString());
	
			// 平均分配左右区间
			let leftCount = Math.floor((n - 1) / 2);
			let rightCount = (n - 1) - leftCount;
	
			divide(left, mid, leftCount);
			divide(mid, right, rightCount);
		}
	
		divide(min, max, N);
		return result.sort(); // 保证顺序
	}

	lexorank_gen_mid(prev: string, next: string) {
		if (!prev && !next) { return undefined }

		if (!prev) {
			return this.LexoRank.parse(next).genPrev().toString()
		}

		if (!next) {
			return this.LexoRank.parse(prev).genNext().toString()
		}

		let p = this.LexoRank.parse(prev);
		let n = this.LexoRank.parse(next);
		return p.between(n).toString();

	}

	async lexorank_set_id(tfile: TAbstractFile, key: string | undefined) {
		if (!key) { return false }
		let ckey = await this.lexorank_get_id(tfile);
		if (ckey == key) { return false }
		if (tfile instanceof TFolder) {
			let xfile = await this.get_folder_note(tfile, true);
			console.log(`set ${xfile.basename} ${this.fid} as ${key}`)
			await this.plugin.editor.set_frontmatter(xfile, this.fid, key)
		} else if (tfile instanceof TFile) {
			if (!this.plugin.wordcout.filter(tfile)) { return }
			console.log(`set ${tfile.basename} ${this.nid} as ${key}`)
			await this.plugin.editor.set_frontmatter(tfile, this.nid, key);
		}
		return true;
	}

	async lexorank_get_id(tfile: TAbstractFile) {
		if (tfile instanceof TFolder) {
			let xfile = await this.get_folder_note(tfile, false);
			if (xfile) {
				return this.plugin.editor.get_frontmatter(xfile, this.fid)
			} else {
				return undefined;
			}
		} else if (tfile instanceof TFile) {
			if (this.plugin.wordcout.filter(tfile)) {
				return this.plugin.editor.get_frontmatter(tfile, this.nid);
			}
		}
	}

	async lexorank_init_folder(tfolder: TFolder, recursive = false) {
		let tfiles = this.children[tfolder.path];
		if (tfiles) {
			tfiles = tfiles.filter((tfile: TAbstractFile) => {
				return tfile instanceof TFolder || (
					tfile instanceof TFile && tfile.extension == 'md'
				)
			})
			let keys = this.lexorank_init_keys(tfiles.length);
			let i = 0;
			while (i < tfiles.length) {
				await this.lexorank_set_id(tfiles[i], keys[i]);
				i = i + 1;
			}
		}
		if (!recursive) { return }
		for (let tfile of tfiles) {
			if (tfile instanceof TFolder) {
				await this.lexorank_init_folder(tfile, recursive);
			}
		}
	}

	lexorank_gen_keys(keys:(string|undefined)[]):(string|undefined)[]{
		// 2️⃣ 遍历
		let i = 0;
		while (i < keys.length) {
			if (!keys[i]) {
				// 🔹缺失 key -> 找前后边界
				let prevKey: string | null = null;
				for (let j = i - 1; j >= 0; j--) {
					if (keys[j]) {
						prevKey = keys[j]!;
						break;
					}
				}

				let nextKey: string | null = null;
				for (let j = i + 1; j < keys.length; j++) {
					if (keys[j]) {
						nextKey = keys[j]!;
						break;
					}
				}

				let prevRank: LexoRank | null = prevKey ? this.LexoRank.parse(prevKey) : null;
				let nextRank: LexoRank | null = nextKey ? this.LexoRank.parse(nextKey) : null;

				let newRank: LexoRank;
				if (prevRank && nextRank) {
					if (prevRank.toString() === nextRank.toString()) {
						// 🔹相等：没空间，顺延
						newRank = prevRank.genNext();
					} else {
						newRank = prevRank.between(nextRank);
					}
				} else if (prevRank) {
					newRank = prevRank.genNext();
				} else if (nextRank) {
					newRank = nextRank.genPrev();
				} else {
					newRank = this.LexoRank.middle();
				}

				keys[i] = newRank.toString();
				i++;
				continue;
			}

			// 🔹检测冲突（非递增）
			if (i > 0 && keys[i - 1]! >= keys[i]!) {
				let start = i - 1;
				let end = i;
				while (end + 1 < keys.length && keys[end]! >= keys[end + 1]!) end++;

				// 前后边界
				let leftKey: string | null = start > 0 ? keys[start - 1] || null : null;
				let rightKey: string | null = end + 1 < keys.length ? keys[end + 1] || null : null;

				let lastRank: LexoRank | null = leftKey ? this.LexoRank.parse(leftKey) : null;

				// 🔹批量生成冲突区间 key
				for (let k = start; k <= end; k++) {
					let nextRank: LexoRank | null = rightKey ? this.LexoRank.parse(rightKey) : null;
					let newRank: LexoRank;

					if (lastRank && nextRank) {
						if (lastRank.toString() === nextRank.toString()) {
							// 🔹相等：没空间，顺延
							newRank = lastRank.genNext();
						} else {
							newRank = lastRank.between(nextRank);
						}
					} else if (lastRank) {
						newRank = lastRank.genNext();
					} else if (nextRank) {
						newRank = nextRank.genPrev();
					} else {
						newRank = this.LexoRank.middle();
					}

					keys[k] = newRank.toString();
					lastRank = this.LexoRank.parse(keys[k]);
				}

				i = end + 1;
				continue;
			}

			i++;
		}
		return keys;
	}

	
	lexorank_check_keys(keys:(string|undefined)[]){
		let i = 0;
		while(i<keys.length-1){
			let curr = keys[i];
			let next = keys[i+1];
			if(!curr || !next){
				return false;
			}
			if(next <= curr){
				return false;
			}
			i = i +1;
		}
		return true;
	}

	async lexorank_get_ids(tfiles:TAbstractFile[]){
		let keys: (string | undefined)[] = [];
		for (let i = 0; i < tfiles.length; i++) {
			let k = await this.lexorank_get_id(tfiles[i]);
			keys.push(k);
		}
		return keys;
	}

	async lexorank_set_ids(tfiles:TAbstractFile[],keys:(string|undefined)[]){
		let p: Promise<any>[] = [];
		let i = 0;
		while (i < tfiles.length) {
			if (
				tfiles[i] instanceof TFolder ||
				(tfiles[i] instanceof TFile && (tfiles[i] as TFile).basename == tfiles[i].parent?.name)
			) {
				p.push(this.lexorank_set_id(tfiles[i], keys[i]));
			} else {
				p.push(this.lexorank_set_id(tfiles[i], keys[i]));
			}
			i++;
		}

		const results = await Promise.all(p);
		return results;
	}

	async lexorank_reset_tfiles(tfiles: TAbstractFile[],rebuild=false) {
		// 仅保留文件夹和 md 文件
		tfiles = tfiles.filter(
			(f: TAbstractFile) => f instanceof TFolder || (f instanceof TFile && f.extension === "md")
		);
		let keys;
		if(rebuild){
			keys = this.lexorank_init_keys(tfiles.length);
		}else{
			keys = await this.lexorank_get_ids(tfiles);
			let  i = 0;
			while(!this.lexorank_check_keys(keys)){
				console.log('i','lexorank_gen_keys--',i)
				keys = this.lexorank_gen_keys(keys);
				i = i+1;
				if(i>5){
					break;
				}
			}
		}
		let p = await this.lexorank_set_ids(tfiles,keys);
		return p;
	}


	async lexorank_reset_folder(tfolder: TFolder, recursive = false) {
		let tfiles = this.children[tfolder.path];
		if (!tfiles) return;

		await this.lexorank_reset_tfiles(tfiles);

		// 3️⃣ 递归处理子文件夹
		if (recursive) {
			for (let f of tfiles) {
				if (f instanceof TFolder) {
					await this.lexorank_reset_folder(f, recursive);
				}
			}
		}
		console.log(`Lexorank reset folder: ${tfolder.path} ✔️`)
	}

	async lexorank_reset_vault(root = '/',rebuild=false) {
		let i = 10;
		let res;
		while(i!=0){
			let tfiles = this.children_as_chain(root);
			res = await this.lexorank_reset_tfiles(tfiles,rebuild);
			if(res.filter(x=>x).length==0){
				break
			}
			i = i -1
		}
		console.log(`Lexorank reset vault: ${root} ✔️`)
		return res?.filter(x=>x).length;
	}
}