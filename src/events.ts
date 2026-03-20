import {
	TAbstractFile,
	TFile,
	TFolder,
	CachedMetadata,
	Notice
} from 'obsidian';

import NoteChainPlugin from '../main';


const onFileOpen = (plugin: NoteChainPlugin) => {
	plugin.registerEvent(
		plugin.app.workspace.on('file-open', plugin.ufunc_on_file_open.bind(plugin))
	);
};

const onDeleteFile = (plugin: NoteChainPlugin) => {
	plugin.registerEvent(plugin.app.vault.on(
		'delete',
		async (file: TFile) => {
			await plugin.chain.chain_pop_node(file);
			await plugin.explorer.sort();
		}
	));
};

const onCreateFile = (plugin: NoteChainPlugin) => {
	plugin.registerEvent(plugin.app.vault.on(
		'create',
		async () => {
			await sleep(500);
			plugin.explorer.sort(0, true);
		}
	));
};

const onRenameFile = (plugin: NoteChainPlugin) => {
	plugin.registerEvent(plugin.app.vault.on(
		'rename',
		async (file: TFile, oldPath: string) => {
			const oldFolder = plugin.app.vault.getFolderByPath(
				oldPath.slice(0, oldPath.lastIndexOf('/'))
			);
			if (oldFolder != file.parent && plugin.settings.auto_notechain) {
				await plugin.chain.chain_pop_node(file);
				await plugin.auto_notechain(file);
			}
			oldFolder && plugin.chain.refresh_folder(oldFolder);
			plugin.chain.refresh_tfile(file);
			plugin.explorer.sort();
			plugin.explorer.set_fileitem_style_of_file(file);
		}
	));
};

const onFileMenuCreateNextNote = (plugin: NoteChainPlugin) => {
	plugin.registerEvent(
		plugin.app.workspace.on('file-menu', (menu, file) => {
			if (file instanceof TFile) {
				menu.addItem((item) => {
					item
						.setTitle(plugin.strings.filemenu_create_next_note)
						.setIcon('file-plus')
						.onClick(async () => {
							const filename = await plugin.easyapi.dialog_prompt('File name');
							if (!filename) { return; }
							const dst = file.parent ? file.parent.path + '/' + filename + '.md' : filename + '.md';
							if (plugin.easyapi.file.get_tfile(dst)) {
								new Notice('Exists:' + file.path, 3000);
							} else {
								const tfile = await plugin.app.vault.create(dst, '');
								await plugin.chain.chain_insert_node_after(tfile, file);

								await plugin.editor.set_frontmatter_align_file(
									file, tfile, plugin.settings.field_of_confluence_tab_format
								);

								await plugin.chain.open_note(tfile, false, false);
							}
						});
				});
			}
		})
	);
};

const onFileMenuMoveAsNextNote = (plugin: NoteChainPlugin) => {
	plugin.registerEvent(
		plugin.app.workspace.on('file-menu', (menu, file) => {
			if (file instanceof TFile && file.extension == 'md') {
				menu.addItem((item) => {
					item
						.setTitle(plugin.strings.filemenu_move_as_next_note)
						.setIcon('hand')
						.onClick(async () => {
							const anchor = await plugin.chain.sugguster_note();
							if (anchor) {
								await plugin.chain.chain_insert_node_after(file, anchor);
								await plugin.editor.set_frontmatter_align_file(
									anchor, file, plugin.settings.field_of_confluence_tab_format
								);

								if (file.parent != anchor.parent) {
									const dst = anchor.parent.path + '/' + file.name;
									await plugin.app.fileManager.renameFile(file, dst);
								}
								plugin.explorer.sort();
							}
						});
				});
			} else if (file instanceof TFolder) {
				menu.addItem((item) => {
					item
						.setTitle(plugin.strings.filemenu_move_as_next_note)
						.setIcon('hand')
						.onClick(async () => {
							let notes = file.parent?.children;
							if (notes) {
								notes = plugin.chain.sort_tfiles_by_chain(notes);
								notes = notes.filter((x: TAbstractFile) => x != file);
								const anchor = await plugin.easyapi.dialog_suggest(
									notes.map((x: TAbstractFile) => x instanceof TFile ? '📃' + x.basename : '📁' + x.name),
									notes
								);
								if (!anchor) { return; }
								await plugin.chain.move_folder_as_next_note(file, anchor);
								new Notice(`${anchor instanceof TFile ? anchor.basename : anchor.name}-->${file.name}`);
								plugin.chain.refresh_tfile(file);
								await plugin.explorer.sort(0, true);
							}
						});
				});
			}
			const selector = document.querySelectorAll(
				'.tree-item-self.is-selected'
			);
			let items = Object.values(selector).map((x: any) => x.dataset?.path);
			let tfiles = items.map(x => plugin.easyapi.file.get_tfile(x)).filter(x => x.extension == 'md');
			if (tfiles.length > 1) {
				menu.addItem((item) => {
					item
						.setTitle(plugin.strings.filemenu_move_as_next_notes)
						.setIcon('hand')
						.onClick(async () => {
							tfiles = plugin.chain.sort_tfiles_by_chain(tfiles);
							let notes = plugin.easyapi.file.get_all_tfiles();
							notes = notes.filter((x: TFile) => !tfiles.contains(x));
							const anchor = await plugin.chain.sugguster_note(notes);
							if (!anchor) { return; }
							for (let tfile of tfiles) {
								if (tfile.parent.path != anchor.parent.path) {
									const dst = anchor.parent.path + '/' + tfile.name;
									await plugin.app.fileManager.renameFile(tfile, dst);
								}
								await plugin.chain.chain_pop_node(tfile);
							}
							tfiles.unshift(anchor);
							const anchor_next = plugin.chain.get_next_note(anchor);
							if (anchor_next) { tfiles.push(anchor_next); }
							await plugin.chain.chain_concat_tfiles(tfiles);
							for (let dst of tfiles.slice(1, tfiles.length - 1)) {
								await plugin.editor.set_frontmatter_align_file(
									anchor, dst, plugin.settings.field_of_confluence_tab_format
								);
							}
						});
				});
			}
		})
	);
};

const onMetadataChanged = (plugin: NoteChainPlugin) => {
	plugin.registerEvent(
		plugin.app.metadataCache.on(
			'changed',
			async (file: TFile, data: string, cache: CachedMetadata) => {
				if (file == plugin.chain.current_note) {
					clearTimeout(plugin.timerId);
				}
				const timerId = setTimeout(async () => {
					if (file.parent) {
						plugin.chain.children[file.parent.path] = plugin.chain.sort_tfiles_by_chain(
							file.parent.children
						);
					}
					plugin.explorer.sort(0, false);

					if (plugin.settings.field_of_display_text) {
						const txt = plugin.explorer.get_display_text(file);
						const items = (plugin.explorer.file_explorer as any).fileItems;
						plugin.explorer._set_display_text_(items[file.path], txt);

						const canvas = items[file.path.slice(0, file.path.length - 2) + 'canvas'];
						plugin.explorer._set_display_text_(canvas, txt);

						if ((file.parent && file.basename == file.parent.name) || (file.parent && file.parent.path == '/')) {
							const field = plugin.editor.get_frontmatter(file, plugin.settings.field_of_display_text);
							const prev = (file as any).note_chain_display_field;
							if (!prev || prev != field) {
								for (let key in items) {
									const item = items[key];
									let ppath = '';
									if (file.parent.path == '/') {
										ppath == '';
									} else {
										ppath = file.parent.path + '/';
									}
									if (item.file.path.startsWith(ppath) || item.file.path == file.parent.path) {
										const txt = plugin.explorer.get_display_text(item.file);
										plugin.explorer._set_display_text_(item, txt);
									}
								}
							}
							(file as any).note_chain_display_field = field;
						}
					}

					if (plugin.settings.field_of_background_color) {
						const style = await plugin.explorer.get_fileitem_style(file);
						await plugin.explorer.set_fileitem_style_of_file(file, style);
						const items = (plugin.explorer.file_explorer as any).fileItems;

						const canvas = items[file.path.slice(0, file.path.length - 2) + 'canvas'];
						if (canvas) {
							await plugin.explorer.set_fileitem_style_of_file(canvas.file, style);
						}

						if ((file.parent && file.basename == file.parent.name) || (file.parent && file.parent.path == '/')) {
							const field = plugin.editor.get_frontmatter(file, plugin.settings.field_of_background_color);
							const prev = (file as any).note_chain_bgcolor;
							if (!prev || prev != field) {
								for (let key in items) {
									const item = items[key];
									let ppath = '';
									if (file.parent.path == '/') {
										ppath == '';
									} else {
										ppath = file.parent.path + '/';
									}
									if (item.file.path.startsWith(ppath) || item.file.path == file.parent.path) {
										const style = await plugin.explorer.get_fileitem_style(item.file);
										await plugin.explorer.set_fileitem_style_of_file(item.file, style);
									}
								}
							}
							(file as any).note_chain_bgcolor = field;
						}
					}

				}, 500);
				if (file == plugin.chain.current_note) {
					plugin.timerId = timerId;
				}

			})
	);
};

const eventBuilders = [
	onFileOpen,
	onDeleteFile,
	onCreateFile,
	onRenameFile,
	onFileMenuCreateNextNote,
	onFileMenuMoveAsNextNote,
	onMetadataChanged
];

export function addEvents(plugin: NoteChainPlugin) {
	eventBuilders.forEach((c) => {
		c(plugin);
	});
}

