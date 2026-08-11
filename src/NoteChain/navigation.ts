import {
	MarkdownView,
	Notice,
	TAbstractFile,
	TFile, TFolder,
	moment
} from 'obsidian';

import { NoteContentModal } from '../NCModal';
import { NoteContentView } from '../NCView';
import { strings } from './strings';

export class NoteChainNavigation {
	/** Host NoteChain fields/methods (filled by applyMixins). */
	[key: string]: any;


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

			view.setContent(content, sourcePath, webUrl);
		} catch (error) {
			new Notice(`Error opening note in modal: ${error.message}`);
		}
	}

	async sugguster_note(notes: null | Array<TFile> = null, slice = 0, onlyname = false,new_value=false) {
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
			let note = await this.plugin.easyapi.dialog_suggest(msg, notes,'',new_value);
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
			let idx = leaves.map((x: any) => x.view == activeLeaf).indexOf(true);
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
		leaves = leaves.filter((x: any) => x.getViewState().state.file);
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

	/** Walk Prev/Next only among `files` (ignore links that leave the set). */
	get_chain_among(tfile: TFile, files: Set<TFile> | TFile[]): TFile[] {
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

}
