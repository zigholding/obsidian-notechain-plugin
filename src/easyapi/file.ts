


import { App, View, WorkspaceLeaf, TFile, TFolder, TAbstractFile } from 'obsidian';
import { CardNavigatorOptions, type CardItem } from './gui/inputCardSuggester'

import { EasyAPI } from 'src/easyapi/easyapi'

export class File {
	app: App;
	api: EasyAPI;

	constructor(app: App, api: EasyAPI) {
		this.app = app;
		this.api = api;
	}

	get_tfile(path: string | TFile | null, only_first = true) {
		try {
			if (!path) {
				return null;
			}
			if (path instanceof TFile) {
				return path;
			}
			path = path.split('|')[0].replace('![[', '').replace('[[', '').replace(']]', '');
			let tfile = this.app.vault.getFileByPath(path)
			if (tfile) {
				return tfile;
			}

			let tfiles = (this.app.metadataCache as any).uniqueFileLookup.get(path.toLowerCase());
			if (!tfiles) {
				tfiles = (this.app.metadataCache as any).uniqueFileLookup.get(path.toLowerCase() + '.md');
				if (!tfiles) {
					return null;
				} else {
					path = path + '.md'
				}
			}

			let ctfiles = tfiles.filter((x: TFile) => x.name == path)
			if (ctfiles.length > 0) {
				if (only_first) {
					return ctfiles[0]
				} else {
					return ctfiles
				}
			}

			if (tfiles.length > 0) {
				if (only_first) {
					return tfiles[0]
				} else {
					return tfiles
				}
			}
			return null;
		} catch {
			return null
		}
	}

	get_all_tfiles() {
		let files = this.app.vault.getMarkdownFiles();
		return files;
	}

	get_tfiles_of_folder(tfolder: TFolder | null, n = 0): any {
		if (!tfolder) { return []; }
		let notes = [];
		for (let c of tfolder.children) {
			if (c instanceof TFile && c.extension === 'md') {
				notes.push(c);
			} else if (c instanceof TFolder && n != 0) {
				let tmp = this.get_tfiles_of_folder(c, n - 1);
				for (let x of tmp) {
					notes.push(x);
				}
			}
		}
		return notes;
	}

	get_brothers(tfile = this.api.cfile) {
		if (tfile && tfile.parent) {
			return this.get_tfiles_of_folder(tfile.parent, 0);
		} else {
			return [];
		}

	}

	get_uncles(tfile: TFile) {
		if (tfile && tfile.parent && tfile.parent.parent) {
			let folder = tfile.parent.parent;
			return folder.children.filter(
				(x: TAbstractFile) => x instanceof TFile
			)
		}
		return []
	}

	get_link_of_file(tfile: TFile) {
		if (!tfile) { return null }
		let tfiles = this.get_tfile(tfile.name, false);
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

	get_all_tfiles_of_tags(tags: string | Array<string>) {
		if (!Array.isArray(tags)) {
			tags = [tags]
		}

		tags = tags.map(x => {
			if (x.startsWith('#')) {
				return x;
			} else {
				return '#' + x;
			}
		})

		let tfiles = this.get_all_tfiles().filter(x => {
			let ttags = this.get_tags(x);
			for (let tag of tags) {
				if (ttags.contains(tag)) {
					return true;
				}
			}
		})
		return tfiles;
	}

	generate_structure(tfolder: TFolder, depth = 0, isRoot = true, only_folder = false, only_md = true) {
		let structure = '';
		const indentUnit = '    '; // 关键修改点：每层缩进 4 空格
		const verticalLine = '│   '; // 垂直连接线密度增强
		const indent = verticalLine.repeat(Math.max(depth - 1, 0)) + indentUnit.repeat(depth > 0 ? 1 : 0);
		const children = tfolder.children || [];

		// 显示根目录名称
		if (isRoot) {
			structure += `${tfolder.name}/\n`;
			isRoot = false;
		}

		children.forEach((child, index) => {
			const isLast = index === children.length - 1;
			const prefix = isLast ? '└── ' : '├── '; // 统一符号风格

			if (child instanceof TFolder) {
				// 目录节点：增加垂直连接线密度
				structure += `${indent}${prefix}${child.name}/\n`;
				structure += this.generate_structure(child, depth + 1, isRoot, only_folder, only_md);
			} else if (!only_folder) {
				// 文件节点：对齐符号与目录
				if (only_md && (child as TFile).extension != 'md') { return }
				structure += `${indent}${prefix}${child.name}\n`;
			}
		});
		return structure;
	}

	get_tags(tfile: TFile) {
		if (!tfile) { return [] }
		let mcache = this.app.metadataCache.getFileCache(tfile);
		let tags: Array<string> = []
		if (mcache?.tags) {
			for (let curr of mcache.tags) {
				if (!tags.contains(curr.tag)) {
					tags.push(curr.tag)
				}
			}
		}
		if (mcache?.frontmatter?.tags) {
			if (Array.isArray(mcache.frontmatter.tags)) {
				for (let curr of mcache.frontmatter.tags) {
					let tag = '#' + curr;
					if (!tags.contains(tag)) {
						tags.push(tag)
					}
				}
			} else if (typeof mcache.frontmatter.tags === 'string') {
				let tag = `#` + mcache.frontmatter.tags
				if (!tags.contains(tag)) {
					tags.push(tag)
				}
			}

		}
		return tags
	}

	get_inlinks(tfile = this.api.cfile, only_md = true): Array<TFile> {
		if (tfile == null) { return []; }
		let res: Array<TFile> = []

		let inlinks = (this.app.metadataCache as any).getBacklinksForFile(tfile);
		for (let [k, v] of inlinks.data) {
			let curr = this.app.vault.getFileByPath(k);
			if (curr) {
				res.push(curr)
			}
		}
		return res;
	}

	get_outlinks(tfile = this.api.cfile, only_md = true): Array<TFile> {
		if (tfile == null) { return []; }

		let mcache = this.app.metadataCache.getFileCache(tfile);
		if (!mcache) { return []; }

		let res: Array<TFile> = [];
		if (mcache.links) {
			for (let link of mcache.links) {
				let tfile = this.get_tfile(link.link);
				if (tfile && !res.contains(tfile) && !(only_md && tfile.extension != 'md')) {
					res.push(tfile);
				}
			}
		}
		if (mcache.frontmatterLinks) {
			for (let link of mcache.frontmatterLinks) {
				let tfile = this.get_tfile(link.link);
				if (tfile && !res.contains(tfile) && !(only_md && tfile.extension != 'md')) {
					res.push(tfile);
				}
			}
		}
		if (mcache.embeds) {
			for (let link of mcache.embeds) {
				let tfile = this.get_tfile(link.link);
				if (only_md && tfile && tfile.extension != 'md') { continue; }
				if (tfile && !res.contains(tfile)) {
					res.push(tfile);
				}
			}
		}
		return res;
	}

	get_links(tfile = this.api.cfile, only_md = true) {
		let inlinks = this.get_inlinks(tfile, only_md);
		let outlinks = this.get_outlinks(tfile, only_md);
		for (let link of inlinks) {
			if (!outlinks.contains(link)) {
				outlinks.push(link)
			}
		}
		return outlinks;
	}

	get_group_inlinks(tfiles: Array<TFile>, level = 1) {
		let items = tfiles.map((x: TFile) => x);
		while (level != 0) {
			let curr = items.map((x: TFile) => x);
			for (let c of curr) {
				let links = this.get_inlinks(c, true);
				for (let link of links) {
					if (!items.contains(link)) {
						items.push(link)
					}
				}
			}
			if (curr.length == items.length) {
				break;
			}
			level = level - 1;
		}
		return items;
	}

	get_group_outlinks(tfiles: Array<TFile>, level = 1) {
		let items = tfiles.map((x: TFile) => x);
		while (level != 0) {
			let curr = items.map((x: TFile) => x);
			for (let c of curr) {
				let links = this.get_outlinks(c, true);
				for (let link of links) {
					if (!items.contains(link)) {
						items.push(link)
					}
				}
			}
			if (curr.length == items.length) {
				break;
			}
			level = level - 1;
		}
		return items;
	}


	get_group_links(tfiles: Array<TFile>, level = 1) {
		let items = tfiles.map((x: TFile) => x);
		while (level != 0) {
			let curr = items.map((x: TFile) => x);
			for (let c of curr) {
				let links = this.get_links(c, true);
				for (let link of links) {
					if (!items.contains(link)) {
						items.push(link)
					}
				}
			}
			if (curr.length == items.length) {
				break;
			}
			level = level - 1;
		}
		return items;
	}

	get_all_folders() {
		let folders = (this.app.vault as any).getAllFolders();
		let folder = this.app.vault.getFolderByPath('/');
		if (folder && !folders.contains(folder)) {
			folders.push(folder);
		}
		return folders;
	}

	get_tfolders(name: string) {
		let folder = this.app.vault.getFolderByPath(name);
		if (folder) {
			return [folder];
		}
		return this.get_all_folders().filter((x: TFolder) => x.name == name);
	}

	get_all_tfiles_tags(tags: string | Array<string>) {
		if (!Array.isArray(tags)) {
			tags = [tags]
		}

		tags = tags.map(x => {
			if (x.startsWith('#')) {
				return x;
			} else {
				return '#' + x;
			}
		})

		let tfiles = this.get_all_tfiles().filter(x => {
			let ttags = this.get_tags(x);
			for (let tag of tags) {
				if (ttags.contains(tag)) {
					return true;
				}
			}
		})
		return tfiles;
	}

	get_group(group: string) {
		let tfiles: Array<TFile> = [];
		let tags = this.get_all_tfiles_tags(group);
		for (let f of tags) {
			if (!tfiles.contains(f)) {
				tfiles.push(f);
			}
		}

		let folders = this.get_tfolders(group);
		for (let folder of folders) {
			let xfiles = this.get_tfiles_of_folder(folder, -1);
			for (let f of xfiles) {
				if (!tfiles.contains(f)) {
					tfiles.push(f);
				}
			}
		}

		let tfile = this.get_tfile(group);
		if (tfile) {
			let xfiles = this.get_links(tfile, true);
			for (let f of xfiles) {
				if (!tfiles.contains(f)) {
					tfiles.push(f);
				}
			}
		}
		return tfiles;
	}

	get_selected_files(current_if_no_selected = true) {
		let selector = document.querySelectorAll(
			".tree-item-self.is-selected"
		);
		let items = Object.values(selector).map((x: any) => {
			var _a;
			return (_a = x.dataset) == null ? void 0 : _a.path;
		});
		let tfiles = items.map(
			(x) => this.get_tfile(x)).filter((x) => x.extension == "md"
			)
		if (tfiles.length > 0) {
			return tfiles
		} else if (current_if_no_selected && this.app.workspace.getActiveFile()) {
			return [this.app.workspace.getActiveFile()]
		} else {
			return []
		}
	}

	async read_binary_to_base64(tfile: TFile) {
		tfile = this.get_tfile(tfile)
		if (!tfile) { return null }
		let buffer = await this.app.vault.readBinary(tfile)

		let binary = '';
		let bytes = new Uint8Array(buffer);
		let len = bytes.byteLength;
		for (let i = 0; i < len; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		let text = window.btoa(binary);
		let bs64 = `data:image/png;base64,${text}`;
		return bs64
	}

	async select_tfile_cards(tfiles: TFile[], options: CardNavigatorOptions = {}) {
		if (!tfiles || tfiles.length === 0) {
			return null;
		}

		let data = tfiles.map(file => ({
			name: file.basename,
			detail: file.path,
			image: this.api.editor.get_frontmatter(file, 'cover') || "file",
			file: file, // 👈 自定义挂载，方便后面用
			async action(item: CardItem) {
				// 这里直接返回，不做打开动作
				return item;
			}
		}))

		// 4️⃣ 打开卡片选择器
		let result = await this.api.dialog_cards(data, options);

		// 5️⃣ 返回选中的 TFile
		return result?.file || null;
	}

	/** 卡片导航选择：先将 `tfiles` 按父文件夹分组，再打开卡片选择器。 */
	async select_tfile_cards_by_folder(tfiles: TFile[], options: CardNavigatorOptions = {}) {
		if (!tfiles || tfiles.length === 0) {
			return null;
		}

		// 2️⃣ 按文件夹分组
		const groups: Record<string, TFile[]> = {};
		for (let file of tfiles) {
			const folder = file.parent?.path || "根目录";
			if (!groups[folder]) groups[folder] = [];
			groups[folder].push(file);
		}

		// 3️⃣ 转成 CardItem 结构
		const data = Object.entries(groups).map(([folder, files]) => {
			return {
				name: folder.split('/').pop(), // 只显示最后一级目录名
				detail: `${files.length} 个笔记`,
				image: this.api.editor.get_frontmatter(folder, 'cover') || "folder",
				action: files.map(file => ({
					name: file.basename,
					detail: file.path,
					image: this.api.editor.get_frontmatter(file, 'cover') || "file",
					file: file, // 👈 自定义挂载，方便后面用
					async action(item: CardItem) {
						// 这里直接返回，不做打开动作
						return item;
					}
				}))
			};
		});

		// 4️⃣ 打开卡片选择器
		const result = await this.api.dialog_cards(data, options);

		// 5️⃣ 返回选中的 TFile
		return result?.file || null;
	}
}

