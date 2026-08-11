import {
	TAbstractFile,
	TFile, TFolder
} from 'obsidian';

export class NoteChainFolderChildren {
	/** Host NoteChain fields/methods (filled by applyMixins). */
	[key: string]: any;


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
					"FolderPrevNote": this.plugin.easyapi.file.get_link_of_file(anchor),
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

}
