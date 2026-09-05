import {
	App,
	TAbstractFile,
	TFile, TFolder
} from 'obsidian';
import type NoteChainPlugin from '../plugin';
import type { NoteChain } from '../NoteChain';
import { asFileExplorerView } from '../obsidian-app';

export class NoteChainFolderChildren {
	plugin!: NoteChainPlugin;
	app!: App;
	prev!: string;
	next!: string;
	children!: Record<string, TAbstractFile[]>;


	children_as_chain(this: NoteChain, root = '/'): TAbstractFile[] {
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

	init_children(this: NoteChain) {
		const next: Record<string, TAbstractFile[]> = {};
		for (let f of this.plugin.easyapi.file.get_all_folders()) {
			let tfiles = f.children.slice();
			if (this.plugin.explorer?.file_explorer) {
				tfiles = this.sort_tfiles(
					tfiles,
					this.plugin.explorer.file_explorer.sortOrder
				);
			}
			next[f.path] = this.sort_tfiles_by_chain(tfiles);
		}
		this.children = next;
	}

	refresh_folder(this: NoteChain, tfolder: TFolder) {
		if (tfolder?.children) {
			if (!this.children) {
				this.children = {};
			}
			let tfiles = tfolder.children.slice();
			if (this.plugin.explorer?.file_explorer) {
				tfiles = this.sort_tfiles(
					tfiles,
					this.plugin.explorer.file_explorer.sortOrder
				);
			}
			this.children[tfolder.path] = this.sort_tfiles_by_chain(
				tfiles
			);
		}
	}

	refresh_tfile(this: NoteChain, tfile: TAbstractFile) {
		if (tfile.parent?.children) {
			this.refresh_folder(tfile.parent);
		}
	}

	sort_folders_by_mtime(this: NoteChain, folders: Array<TFolder>, reverse = true) {
		function ufunc(f: TFolder) {
			const mtimes = f.children
				.filter((child): child is TFile => child instanceof TFile)
				.map((file) => file.stat.mtime);
			return mtimes.length > 0 ? Math.max(...mtimes) : 0;
		}
		let res = folders.sort((a, b) => ufunc(a) - ufunc(b));
		if (reverse) {
			res = res.reverse();
		}
		return res;
	}

	indexOfFolder(this: NoteChain, tfile: TFolder, tfiles: Array<TFile>) {
		let info = this.get_folder_pre_info(tfile);

		let idx = -1;
		const prev = info.prev;
		let anchor = typeof prev === 'string'
			? this.plugin.easyapi.file.get_tfile(prev)
			: null;
		if (anchor) {
			idx = tfiles.indexOf(anchor)
		}

		let offset = info.offset
		if (typeof (offset) == 'string') {
			idx = idx + parseFloat(offset);
		} else {
			idx = idx + offset;
		}
		return idx;
	}

	sort_tfiles<T extends TAbstractFile>(this: NoteChain, files: T[], field: unknown): T[] {
		const mtime = (f: TAbstractFile) => f instanceof TFile ? f.stat.mtime : 0;
		const ctime = (f: TAbstractFile) => f instanceof TFile ? f.stat.ctime : 0;
		if (typeof field === 'string') {
			if (field === 'name' || field === 'alphabetical') {
				return files.sort(
					(a, b) => (a.name.localeCompare(b.name))
				);
			} else if (field === 'mtime' || field === 'byModifiedTime') {
				return files.sort(
					(a, b) => (mtime(a) - mtime(b))
				)
			} else if (field === 'ctime' || field === 'byCreatedTime') {
				return files.sort(
					(a, b) => (ctime(a) - ctime(b))
				)
			} else if (field === 'alphabeticalReverse') {
				return files.sort(
					(b, a) => (a.name.localeCompare(b.name))
				);
			} else if (field === 'byModifiedTimeReverse') {
				return files.sort(
					(b, a) => (mtime(a) - mtime(b))
				)
			} else if (field === 'byCreatedTimeReverse') {
				return files.sort(
					(b, a) => (ctime(a) - ctime(b))
				)
			} else if (field === 'chain') {
				return this.sort_tfiles_by_chain(files) as T[];
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

	sort_tfiles_by_chain(this: NoteChain, tfiles: Array<TAbstractFile>) {
		let baseOrder: TAbstractFile[] | null = null;
		if (tfiles.length > 0) {
			const parentPaths = new Set(
				tfiles
					.map(f => f.parent?.path)
					.filter((p): p is string => !!p)
			);
			if (parentPaths.size === 1) {
				const p = Array.from(parentPaths)[0];
				if (this.children?.[p]) {
					baseOrder = this.children[p];
				}
			}
		}
		const orderSrc = baseOrder ?? tfiles;
		const indexOfInBase = (f: TAbstractFile) => {
			const idx = orderSrc.indexOf(f);
			return idx >= 0 ? idx : Number.MAX_SAFE_INTEGER;
		};

		const notes = tfiles.filter((f): f is TFile => f instanceof TFile)
			.slice()
			.sort((a, b) => {
				const d = indexOfInBase(a) - indexOfInBase(b);
				return d !== 0 ? d : a.name.localeCompare(b.name);
			});

		const remaining = new Set(notes);
		const segments: TFile[][] = [];
		for (const note of notes) {
			if (!remaining.has(note)) { continue; }
			const xchain = this.get_chain(note, -1, -1);
			const segment: TFile[] = [];
			for (const x of xchain) {
				if (remaining.has(x)) {
					segment.push(x);
					remaining.delete(x);
				}
			}
			if (segment.length === 0) {
				remaining.delete(note);
				segments.push([note]);
			} else {
				segments.push(segment);
			}
		}
		segments.sort((a, b) => {
			const ia = Math.min(...a.map(indexOfInBase));
			const ib = Math.min(...b.map(indexOfInBase));
			if (ia !== ib) { return ia - ib; }
			return (a[0]?.name ?? '').localeCompare(b[0]?.name ?? '');
		});

		let res: TAbstractFile[] = [];
		let ctfiles: TFile[] = segments.flat();

		res.push(...ctfiles);
		let canvas = res.filter((f): f is TFile => (f instanceof TFile) && (['canvas','base'].contains(f.extension)))
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
			let rname = res.map(x => x instanceof TFile ? x.basename : x.name);
			let cname = tfile.basename;
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

	sort_tfiles_folder_first(this: NoteChain, tfiles: Array<TFile>) {
		let A = tfiles.filter(f => f instanceof TFolder).sort((a, b) => (a.name.localeCompare(b.name)));
		let B = tfiles.filter(f => f instanceof TFile);
		return this.plugin.utils.concat_array([A, B]);
	}

	sort_tfiles_by_field(this: NoteChain, tfiles: Array<TFile>, field: string) {
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
					let v = av.localeCompare(bv)
					return v
				}
				return 0
			}
		)
		return res;
	}

	view_sort_by_chain(this: NoteChain) {
		let view = asFileExplorerView(this.app.workspace.getLeavesOfType(
			"file-explorer"
		)[0]?.view);
		if (!view) { return; }
		view.sort?.();
		if (view.ready && view.fileItems) {
			for (let path in view.fileItems) {
				let item = view.fileItems[path];
				if (item.vChildren) {
					let files = item.vChildren._children.map((f) => f.file);
					files = this.sort_tfiles_by_chain(files);
					let children = item.vChildren._children.sort(
						(a, b) => files.indexOf(a.file) - files.indexOf(b.file)
					)
					item.vChildren.setChildren(children);
				}
			}
			view.tree?.infinityScroll?.compute()
		}
	}

	get_folder_pre_info(this: NoteChain, tfolder: TFolder): { prev: string | null; offset: number } {
		let note = this.plugin.easyapi.file.get_tfile(tfolder.path + '/' + tfolder.name + '.md');
		if (!note) {
			return {
				prev: null,
				offset: 0.0,
			};
		}
		const prevRaw = this.plugin.editor.get_frontmatter(note, 'FolderPrevNote');
		const offsetRaw = this.plugin.editor.get_frontmatter(note, 'FolderPrevNoteOffset');
		let offset = 0.0;
		if (typeof offsetRaw === 'number') {
			offset = offsetRaw;
		} else if (typeof offsetRaw === 'string') {
			const n = parseFloat(offsetRaw);
			if (!Number.isNaN(n)) offset = n;
		}
		return {
			prev: typeof prevRaw === 'string' ? prevRaw : null,
			offset,
		};
	}

	async set_folder_pre_info(this: NoteChain, tfolder: TFolder, prev: string | TFile | null, offset: number) {
		let tfile = await this.get_folder_note(tfolder);
		if (!tfile) { return; }
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

	async reset_offset_of_folder(this: NoteChain, tfolder: TFolder) {
		let prev = this.get_folder_pre_info(tfolder);
		if (prev.offset == null) {
			return;
		}

		let tfolders = tfolder.parent?.children.filter((x: TAbstractFile) => x instanceof TFolder);
		let folders: TFolder[] = [];
		if (tfolders) {
			for (let x of tfolders) {
				if (!(x instanceof TFolder)) continue;
				let info = this.get_folder_pre_info(x);
				if (info.prev == prev.prev) {
					folders.push(x);
				}
			}
		}
		folders = folders.sort((a, b) => {
			let ainfo = this.get_folder_pre_info(a);
			let binfo = this.get_folder_pre_info(b);
			return ainfo.offset - binfo.offset;
		});

		if (folders.length == 0) { return }

		let base = Math.pow(0.1, Math.ceil(Math.log10(folders.length + 1)) + 1);
		let offset = 0.5 - base;
		for (let folder of folders) {
			offset = offset + base;
			await this.set_folder_pre_info(folder, prev.prev, offset);
		}
	}

	async get_folder_note(this: NoteChain, tfolder: TFolder, create = true) {
		let note = this.plugin.easyapi.file.get_tfile(tfolder.path + '/' + tfolder.name + '.md');
		if (!note && create) {
			note = await this.app.vault.create(tfolder.path + '/' + tfolder.name + '.md', '');
		}
		return note;
	}

	async move_folder_as_next_note(this: NoteChain, tfolder: TFolder, anchor: TFolder | TFile) {
		if (anchor instanceof TFolder) {
			let prev = this.get_folder_pre_info(anchor);
			await this.set_folder_pre_info(tfolder, prev.prev, prev.offset * 1.001);
		} else if (anchor instanceof TFile) {
			let offsets: number[] = [];
			let tfolders = tfolder.parent?.children.filter((x: TAbstractFile) => x instanceof TFolder && x != tfolder);
			if (tfolders) {
				for (let x of tfolders) {
					if (!(x instanceof TFolder)) continue;
					let info = this.get_folder_pre_info(x);
					if (info.prev && this.plugin.easyapi.file.get_tfile(info.prev) == anchor) {
						offsets.push(info.offset);
					}
				}
			}
			if (offsets.length == 0) {
				await this.set_folder_pre_info(tfolder, anchor, 0.5);
			} else {
				await this.set_folder_pre_info(tfolder, anchor, Math.min(...offsets) * 1.001)
			}
		}
		await this.reset_offset_of_folder(tfolder);
	}

}
