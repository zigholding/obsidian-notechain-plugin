import {
	TAbstractFile,
	TFile,
	TFolder,
	CachedMetadata,
	Notice
} from 'obsidian';

import NoteChainPlugin from './plugin';
import { moveSelectedNotesAsNext } from './NoteChain/chainInsert';

const displayFieldByFile = new WeakMap<TFile, unknown>();
const bgColorByFile = new WeakMap<TFile, unknown>();


const onFileOpen = (plugin: NoteChainPlugin) => {
	plugin.registerEvent(
		plugin.app.workspace.on('file-open', (file) => {
			void plugin.ufunc_on_file_open(file);
		})
	);
};

const onDeleteFile = (plugin: NoteChainPlugin) => {
	plugin.registerEvent(plugin.app.vault.on(
		'delete',
		async (file: TAbstractFile) => {
			if (file instanceof TFile) {
				await plugin.chain.chain_pop_node(file);
			}
			if (file.parent) {
				plugin.chain.refresh_folder(file.parent);
			}
			await plugin.explorer.sort();
		}
	));
};

const onCreateFile = (plugin: NoteChainPlugin) => {
	plugin.registerEvent(plugin.app.vault.on(
		'create',
		async (file: TAbstractFile) => {
			if (file.parent) {
				plugin.chain.refresh_folder(file.parent);
			}
			await plugin.explorer.sort();
			if (plugin.settings.notechain.auto_notechain && file instanceof TFile) {
				plugin.schedule_auto_notechain(file);
			}
		}
	));
};

const onRenameFile = (plugin: NoteChainPlugin) => {
	plugin.registerEvent(plugin.app.vault.on(
		'rename',
		async (file: TAbstractFile, oldPath: string) => {
			const slash = oldPath.lastIndexOf('/');
			const oldFolder = slash >= 0
				? plugin.app.vault.getFolderByPath(oldPath.slice(0, slash))
				: plugin.app.vault.getFolderByPath('/');
			const sameFolder = oldFolder == file.parent;
			if (
				file instanceof TFile &&
				!sameFolder &&
				plugin.settings.notechain.auto_notechain
			) {
				await plugin.chain.chain_pop_node(file);
				plugin.schedule_auto_notechain(file);
			}
			if (sameFolder) {
				if (file instanceof TFolder) {
					plugin.chain.remap_children_folder_path(oldPath, file.path);
					plugin.quiet_chain_sort(file.path);
				}
				if (file.parent) {
					plugin.quiet_chain_sort(file.parent.path);
				}
			} else {
				if (oldFolder) plugin.chain.refresh_folder(oldFolder);
				plugin.chain.refresh_tfile(file);
			}
			await plugin.explorer.sort();
			const refreshLabels = () => {
				plugin.explorer.refresh_display_text(file);
				void plugin.explorer.set_fileitem_style_of_file(file);
				void plugin.explorer.sort();
			};
			refreshLabels();
			// Files rewrites innerEl after vault 'rename'; paint again once its handler has run.
			window.setTimeout(refreshLabels, 50);
			window.setTimeout(refreshLabels, 250);
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
									file, tfile, plugin.settings.notechain.field_of_confluence_tab_format
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
									anchor, file, plugin.settings.notechain.field_of_confluence_tab_format
								);

								if (file.parent != anchor.parent && anchor.parent) {
									const dst = anchor.parent.path + '/' + file.name;
									await plugin.app.fileManager.renameFile(file, dst);
								}
								await plugin.explorer.sort();
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
								if (!anchor || !(anchor instanceof TFile || anchor instanceof TFolder)) { return; }
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
			let items = Object.values(selector).map((x) => (x as HTMLElement).dataset?.path);
			let tfiles = items.map(x => plugin.easyapi.file.get_tfile(x ?? null)).filter((x): x is TFile => x instanceof TFile && x.extension == 'md');
			if (tfiles.length > 1) {
				menu.addItem((item) => {
					item
						.setTitle(plugin.strings.filemenu_move_as_next_notes)
						.setIcon('hand')
						.onClick(async () => {
							await moveSelectedNotesAsNext(plugin, tfiles, { alignConfluenceTab: true });
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
			async (file: TFile, _data: string, _cache: CachedMetadata) => {
				if (file == plugin.chain.current_note) {
					if (plugin.timerId != null) {
						window.clearTimeout(plugin.timerId);
					}
				}
				const timerId = window.setTimeout(() => {
					void (async () => {
					const folderPath = file.parent?.path ?? '';
					if (plugin._autoNotechainBusy?.has(folderPath)) {
						plugin.explorer.refresh_display_text(file);
						return;
					}
					if (plugin.is_chain_sort_quiet(folderPath)) {
						plugin.quiet_chain_sort(folderPath);
						plugin.explorer.refresh_display_text(file);
					} else if (file.parent) {
						plugin.chain.refresh_folder(file.parent);
					}
					await plugin.explorer.sort(0, false);

					if (plugin.settings.notechain.field_of_display_text) {
						const txt = plugin.explorer.get_display_text(file);
						const items = plugin.explorer.file_explorer?.fileItems;
						if (items) {
						plugin.explorer._set_display_text_(items[file.path], txt);

						const canvas = items[file.path.slice(0, file.path.length - 2) + 'canvas'];
						plugin.explorer._set_display_text_(canvas, txt);

						const parent = file.parent;
						if (parent && (file.basename == parent.name || parent.path == '/')) {
							const field = plugin.editor.get_frontmatter(file, plugin.settings.notechain.field_of_display_text);
							const prev = displayFieldByFile.get(file);
							if (!prev || prev != field) {
								const ppath = parent.path == '/' ? '' : parent.path + '/';
								for (const key in items) {
									const item = items[key];
									if (item.file.path.startsWith(ppath) || item.file.path == parent.path) {
										const txt = plugin.explorer.get_display_text(item.file);
										plugin.explorer._set_display_text_(item, txt);
									}
								}
							}
							displayFieldByFile.set(file, field);
						}
						}
					}

					if (plugin.settings.notechain.field_of_background_color) {
						const style = await plugin.explorer.get_fileitem_style(file);
						await plugin.explorer.set_fileitem_style_of_file(file, style);
						const items = plugin.explorer.file_explorer?.fileItems;

						if (items) {
						const canvas = items[file.path.slice(0, file.path.length - 2) + 'canvas'];
						if (canvas) {
							await plugin.explorer.set_fileitem_style_of_file(canvas.file, style);
						}

						const parent = file.parent;
						if (parent && (file.basename == parent.name || parent.path == '/')) {
							const field = plugin.editor.get_frontmatter(file, plugin.settings.notechain.field_of_background_color);
							const prev = bgColorByFile.get(file);
							if (!prev || prev != field) {
								const ppath = parent.path == '/' ? '' : parent.path + '/';
								for (const key in items) {
									const item = items[key];
									if (item.file.path.startsWith(ppath) || item.file.path == parent.path) {
										const style = await plugin.explorer.get_fileitem_style(item.file);
										await plugin.explorer.set_fileitem_style_of_file(item.file, style);
									}
								}
							}
							bgColorByFile.set(file, field);
						}
						}
					}

				})();
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

