import {
	App,
	MarkdownView,
	Notice,
	TAbstractFile,
	TFile, TFolder,
	WorkspaceLeaf,
} from 'obsidian';

import { NoteContentModal } from '../NCModal';
import { NoteContentView } from '../NCView';
import type NoteChainPlugin from '../plugin';
import type { NoteChain } from '../NoteChain';
import { obsidianApp, vaultFullPath } from '../obsidian-app';

export class NoteChainNavigation {
	plugin!: NoteChainPlugin;
	app!: App;
	prev!: string;
	next!: string;
	children!: Record<string, TAbstractFile[]>;

	async open_note_in_modal(this: NoteChain, notePath: string) {
		try {
			let file = this.plugin.easyapi.file.get_tfile(notePath);
			if (file instanceof TFile) {
				let content = await this.app.vault.read(file);
				let items = await this.plugin.editor.extract_code_block(
					content, ['datacore*', 'dataview*'],true
				);
				if(items.length > 0){
					content = items.join('\n\n\n');
				}
				let modal = new NoteContentModal(this.app, content, this.plugin, file.path);
				modal.open();
				return modal;
			} else {
				let modal = new NoteContentModal(this.app, notePath, this.plugin, '');
				modal.open();
				return modal;
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`Error opening note in modal: ${message}`);
		}
	}

	async open_note_in_view(this: NoteChain, notePath: string) {
		try {

			let content = '';
			let sourcePath = '';
			let webUrl = '';
			let noteIcon = 'puzzle';
			let displayText = 'Note Preview';

			if (/^https?:\/\//i.test(notePath)) {
				webUrl = notePath;
				noteIcon = 'globe';
				try {
					displayText = new URL(notePath).hostname;
				} catch {
					displayText = notePath;
				}
			} else {
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
			}
			let leaf = this.app.workspace.getRightLeaf(false); // 右侧打开
			if (!leaf) { return }
			await leaf.setViewState({
				type: 'note-content-view',
				active: true,
				state: {
					content: content,
					sourcePath: sourcePath,
					webUrl: webUrl,
					noteIcon: noteIcon,
					displayText: displayText
				}
			});
			let view = leaf.view as NoteContentView;

			await view.setContent(content, sourcePath, webUrl);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`Error opening note in modal: ${message}`);
		}
	}

	async sugguster_note(this: NoteChain, notes: null | Array<TFile> = null, slice = 0, onlyname = false,new_value=false) {
		// 从库中选择一个笔记
		if (notes == null) {
			notes = this.sort_tfiles(
				this.app.vault.getFiles(),
				['mtime', 'x']
			).filter((f: TFile) => this.filter_user_ignore(f));
		}
		if (!notes) { return null; }
		try {
			let items;
			if (onlyname) {
				items = notes.map((f: TFile) => f.basename)
			} else {
				items = notes.map((f: TFile) => f.path.slice(slice))
			}
			let msg = this.plugin.utils.array_prefix_id(items);
			let note = await this.plugin.easyapi.dialog_suggest(msg, notes,'',new_value);
			return note;
		} catch {
			return null;
		}
	}

	async open_note(this: NoteChain, tfile: TFile | null, revealFolder = false, collapse = true) {
		if (!tfile) { return; }
		if (tfile) {
			await this.app.workspace.getLeaf().openFile(tfile);

			if (revealFolder) {
				if (collapse) {
					this.plugin.explorer.file_explorer?.tree?.setCollapseAll(true);
				}
				this.plugin.explorer.file_explorer?.revealInFolder?.(tfile);
			}
		}
	}

	async sugguster_open_note(this: NoteChain) {
		try {
			let note = await this.sugguster_note();
			await this.open_note(note);
		} catch {
			// user cancelled note picker
		}
	}

	get_recent_tfiles(this: NoteChain, only_md = true): Array<TFile> {
		const recentPlugin = obsidianApp(this.app).plugins.getPlugin('recent-files-obsidian') as
			| { data?: { recentFiles?: Array<{ path?: string }> } }
			| null;
		if (recentPlugin) {
			const files = (recentPlugin.data?.recentFiles ?? [])
				.map((x) => this.plugin.easyapi.file.get_tfile(x.path ?? null))
				.filter((x): x is TFile => x instanceof TFile);
			return files;
		} else {
			let recent: TFile[] = [];
			const files = (this.app.workspace as typeof this.app.workspace & {
				recentFileTracker?: { lastOpenFiles?: string[] };
			}).recentFileTracker?.lastOpenFiles;
			if (files && files.length > 0) {
				recent = files.map((x) => this.plugin.easyapi.file.get_tfile(x)).filter((x): x is TFile => x instanceof TFile)
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

	get_last_daily_note(this: NoteChain, recent_first = true) {
		let pattern = /^\d{4}-\d{2}-\d{2}$/;

		if (recent_first) {
			let recent = this.get_recent_tfiles()
			for (let tfile of recent) {
				if (tfile.basename.match(pattern)) {
					return tfile;
				}
			}
		}

		let t = this.plugin.easyapi.time.moment(null);
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

	get_neighbor_leaf(this: NoteChain, offset = 1) {
		let app = this.plugin.app
		let leaves = app.workspace.getLeavesOfType('markdown');
		let activeLeaf = app.workspace.getActiveViewOfType(MarkdownView);
		if (activeLeaf) {
			let idx = leaves.map((x) => x.view == activeLeaf).indexOf(true);
			idx = idx + offset;
			if (idx < 0 || idx > leaves.length - 1) {
				return null;
			}
			return leaves[idx];
		}
	}

	get_last_activate_file(this: NoteChain, only_md = true, skip_conote = true) {
		let tfiles = this.get_recent_tfiles(only_md);
		for (let tfile of tfiles) {
			if (skip_conote && this.plugin.easyapi.file.get_tags(tfile).contains('#conote')) {
				continue;
			}
			return tfile;
		}
		return null;
	}

	get_last_activate_leaf(this: NoteChain, skip_conote = true) {
		let leaves = this.app.workspace.getLeavesOfType('markdown') as Array<WorkspaceLeaf & { activeTime?: number }>;
		leaves = leaves.filter((x) => typeof x.getViewState().state?.file === 'string');
		leaves = leaves.sort((a, b) => (b.activeTime ?? 0) - (a.activeTime ?? 0));

		for (let leaf of leaves) {
			let filePath = leaf.getViewState().state?.file;
			if (typeof filePath !== 'string') continue;
			const file = this.plugin.easyapi.file.get_tfile(filePath);
			if (skip_conote && file && this.plugin.easyapi.file.get_tags(file).contains('#conote')) {
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

	tfile_to_string(this: NoteChain, tfile: TFile) {
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

	async suggester_notes(this: NoteChain, tfile = this.current_note, curr_first = false, smode = ''): Promise<TFile[]> {
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
			mode = await this.plugin.easyapi.dialog_suggest(this.plugin.utils.array_prefix_id(kv), kv) ?? '';
		}
		if (mode === this.plugin.strings.item_currentnote) {
			return tfile instanceof TFile ? [tfile] : [];
		} else if (mode === this.plugin.strings.item_get_brothers) {
			return this.plugin.easyapi.file.get_brothers(tfile) ?? [];
		} else if (mode === this.plugin.strings.item_same_folder) {
			if (tfile?.parent) {
				return this.plugin.easyapi.file.get_tfiles_of_folder(tfile.parent, -1);
			}
			return [];
		} else if (mode === this.plugin.strings.item_inlinks_outlinks) {
			return this.plugin.easyapi.file.get_links(tfile);
		} else if (mode === this.plugin.strings.item_inlins) {
			return this.plugin.easyapi.file.get_inlinks(tfile);
		} else if (mode === this.plugin.strings.item_outlinks) {
			return this.plugin.easyapi.file.get_outlinks(tfile);
		} else if (mode === this.plugin.strings.item_all_noes) {
			return this.plugin.easyapi.file.get_all_tfiles();
		} else if (mode === this.plugin.strings.item_recent) {
			return this.get_recent_tfiles() ?? [];
		} else if (mode === this.plugin.strings.item_uncle_notes) {
			if (tfile) {
				return this.plugin.easyapi.file.get_uncles(tfile);
			}
			return [];
		} else if (mode === this.plugin.strings.item_notechain) {
			const chain = this.get_chain(
				tfile,
				Number(this.plugin.settings.notechain.PrevChain),
				Number(this.plugin.settings.notechain.NextChain)
			);
			return (chain ?? []).filter((f): f is TFile => f instanceof TFile);
		} else {
			return [];
		}
	}


	// Chain
	get_prev_note(this: NoteChain, tfile = this.current_note, across = false) {
		if (!tfile) { return; }
		if ('deleted' in tfile && (tfile as { deleted?: boolean }).deleted) {
			let tfiles = this.app.vault.getMarkdownFiles();

			tfiles = tfiles.filter((f: TFile) => {
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
			let note = typeof name === 'string' ? this.plugin.easyapi.file.get_tfile(name) : null;
			if (!note && across) {// 不存在时，获取文件列表中的下一个文件
				const _prev_ = (file: TAbstractFile): TFile | null => {
					if (file.parent) {
						let tfiles = this.children[file.parent.path];
						let idx = tfiles.indexOf(file);
						// 在当前目录下搜索
						while (idx > 0) {
							let cnote = this.get_1st_note(tfiles[idx - 1], true);
							if (cnote) {
								return cnote;
							} else {
								idx = idx - 1
							}
						}
						return _prev_(file.parent);
					}
					return null;
				}
				note = _prev_(tfile);
			}
			return note ? note : null;
		}
	}

	open_prev_notes(this: NoteChain, tfile = this.current_note) {
		let note = this.get_prev_note(tfile, true);
		void this.open_note(note ?? null);
	}

	get_next_note(this: NoteChain, tfile = this.current_note, across = false) {
		if (!tfile) { return null; }
		if ('deleted' in tfile && (tfile as { deleted?: boolean }).deleted) {
			let tfiles = this.app.vault.getMarkdownFiles();
			tfiles = tfiles.filter((f: TFile) => {
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
			let note = typeof name === 'string' ? this.plugin.easyapi.file.get_tfile(name) : null;
			if (!note && across) {// 不存在时，获取文件列表中的下一个文件
				const _next_ = (file: TAbstractFile): TFile | null => {
					if (file.parent) {
						let tfiles = this.children[file.parent.path];
						let idx = tfiles.indexOf(file);
						// 在当前目录下搜索
						while (idx < tfiles.length - 1) {
							let cnote = this.get_1st_note(tfiles[idx + 1], false);
							if (cnote) {
								return cnote;
							} else {
								idx = idx + 1
							}
						}
						return _next_(file.parent);
					}
					return null;
				}
				note = _next_(tfile);
			}
			return note ? note : null;
		}
	}

	get_1st_note(this: NoteChain, tfile: TAbstractFile, last = false): TFile | undefined {
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

	open_next_notes(this: NoteChain, tfile = this.current_note) {
		let note = this.get_next_note(tfile, true);
		void this.open_note(note ?? null);
	}

	get_chain(this: NoteChain, tfile = this.current_note, prev = 10, next = 10, with_self = true,across=false): TFile[] {
		if (tfile == null) { return []; }

		let res: TFile[] = [];
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

	/** Walk Prev/Next only among `files` (ignore links that leave the set). */
	get_chain_among(this: NoteChain, tfile: TFile, files: Set<TFile> | TFile[]): TFile[] {
		const set = files instanceof Set ? files : new Set(files);
		if (!tfile || !set.has(tfile)) { return []; }

		const res: TFile[] = [tfile];
		let tmp: TFile = tfile;
		while (true) {
			const prev = this.get_prev_note(tmp);
			if (!prev || !set.has(prev) || res.includes(prev)) { break; }
			res.unshift(prev);
			tmp = prev;
		}
		tmp = tfile;
		while (true) {
			const next = this.get_next_note(tmp);
			if (!next || !set.has(next) || res.includes(next)) { break; }
			res.push(next);
			tmp = next;
		}
		return res;
	}

	get_first_note(this: NoteChain, tfile = this.current_note) {
		let notes = this.get_chain(tfile, -1, 0, false);
		if (notes.length > 0) {
			return notes[0];
		} else {
			return null;
		}
	}

	get_last_note(this: NoteChain, tfile = this.current_note) {
		let notes = this.get_chain(tfile, 0, -1, false);
		if (notes.length > 0) {
			return notes[notes.length - 1];
		} else {
			return null;
		}
	}

	get_neighbors(this: NoteChain, tfile = this.current_note) {
		return [
			this.get_prev_note(tfile),
			this.get_next_note(tfile),
		]
	}

	async suggester_sort(this: NoteChain, tfiles: Array<TFile>) {
		if (!tfiles) { return []; }
		if (tfiles.length == 0) { return [] };
		const s = this.plugin.strings;
		const kv: Record<string, string | [string, string]> = {
			'chain': 'chain',
			'name (a to z)': 'name',
			[s.sort_suggester_name_numeric]: 'nameNumeric',
			'ctime (old to new)': 'ctime',
			'mtime (old to new)': 'mtime',
			'name (z to a)': ['name', 'x'],
			[s.sort_suggester_name_numeric_rev]: ['nameNumeric', 'x'],
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

	async get_file_links(this: NoteChain, tfile: TFile, xlinks = true, inlinks = true, outlinks = true, onlymd = false) {
		let items: { [key: string]: string } = {}

		if (!tfile) {
			return items;
		}

		items['🏠 ' + tfile.basename] = vaultFullPath(this.app, tfile.path)
		if (xlinks) {
			let tmp;
			tmp = this.plugin.editor.get_frontmatter(tfile, 'github');
			if (typeof tmp === 'string') {
				if (tmp.contains('github.com')) {
					items['🌐github'] = tmp;
				} else {
					items['🌐github'] = `https://github.com/` + tmp;
				}
			}
			tmp = this.plugin.editor.get_frontmatter(tfile, 'huggingface');
			if (typeof tmp === 'string') {
				if (tmp.contains('huggingface.co')) {
					items['🌐huggingface🤗'] = tmp;
				} else {
					items['🌐huggingface🤗'] = `https://huggingface.co/` + tmp;
				}
			}
			tmp = this.plugin.editor.get_frontmatter(tfile, 'arxiv');
			if (tmp && typeof tmp === 'object' && 'ID' in tmp) {
				const arxivId = tmp.ID;
				if (typeof arxivId === 'string' || typeof arxivId === 'number') {
					items['🌐arxiv'] = `https://arxiv.org/abs/` + String(arxivId);
				}
			}


			let text = await this.app.vault.cachedRead(tfile)
			// 匹配外部链接
			const regex = /\[[^[\]()]*?\]\(.*?\)/g;
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
					items['ℹ️ ' + i.basename] = vaultFullPath(this.app, i.path);
				} else {
					items['ℹ️ ' + i.name] = vaultFullPath(this.app, i.path);
				}
			}
		}
		if (outlinks) {
			let links = this.plugin.easyapi.file.get_outlinks(tfile, false);
			for (let i of links) {
				if (onlymd && !(i.extension === 'md')) { continue; }
				if (i.extension === 'md') {
					items['🅾️ ' + i.basename] = vaultFullPath(this.app, i.path);
				} else {
					items['🅾️ ' + i.name] = vaultFullPath(this.app, i.path);
				}
			}
		}
		items['💒 vault'] = vaultFullPath(this.app, '.');
		return items;
	}

}
