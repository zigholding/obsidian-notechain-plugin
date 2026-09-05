import {
	Notice,
	Plugin,
	Platform,
	TFile
} from 'obsidian';

import { NoteChain } from './NoteChain';
import { EasyEditor } from './easyapi/editor';
import { NCTextarea } from './NCTextarea';
import { NCFileExplorer } from './NCFileExplorer';
import { Strings } from './NoteChain/strings';
import { WordCount } from './WordCount';
import { MermaidGraph, CanvasGraph } from './graph';
import { NCSettingTab } from './setting';
import { NCSettings, NCSettings_DEFAULT } from './NoteChain/setting';
import { WebviewLLMSettings, WebViewLLMSettings_DEFAULT } from './WebViewerLLM/setting';
import { addCommands } from './commands';
import { addEvents } from './events';
import { EasyAPI } from './easyapi/easyapi';
import { NoteContentView } from './NCView';
import { HTTPServer } from './server/httpServer';
import { getWebViewerPartition, installWebviewTlsTrust } from './server/tlsWebviewTrust';
import { DailyJob } from './daily_job';
import { WebViewerLLMModule } from './WebViewerLLM/WebViewerLLMModule';
import { moveSelectedNotesAsNext } from './NoteChain/chainInsert';
import { noteChainPlugin, obsidianApp, vaultBasePath, desktopNode, type NodePathModule } from './obsidian-app';
import * as ncUtils from './utils';
import * as obsidianApi from 'obsidian';

export interface NoteChainPluginData {
	notechain: NCSettings;
	webviewllm: WebviewLLMSettings;
}

export default class NoteChainPlugin extends Plugin {
	settings!: NoteChainPluginData;
	chain!: NoteChain;
	textarea!: NCTextarea;
	explorer!: NCFileExplorer;
	mermaid!: MermaidGraph;
	canvas!: CanvasGraph;
	wordcount!: WordCount;
	dailyjob!: DailyJob;
	webviewerllm!: WebViewerLLMModule;
	strings!: Strings;
	status!: string;
	debug!: boolean;
	utils!: typeof ncUtils;
	timerId: number | NodeJS.Timeout | null = null;
	ob!: typeof obsidianApi;
	easyapi!: EasyAPI;
	httpServer: HTTPServer | null = null;
	_autoNotechainTimers: Map<string, number> | null = null;
	_autoNotechainPending: Map<string, TFile> | null = null;
	_autoNotechainBusy: Set<string> | null = null;

	/** 原 NCEditor API：与 `easyapi.editor` 相同 */
	get editor(): EasyEditor {
		return this.easyapi.editor;
	}

	async onload() {
		this.status = 'waiting'
		this.app.workspace.onLayoutReady(
			() => {
				void (async () => {
					await this._onload_();
					void this._after_loading_();
				})();
			}
		)
	}

	async _after_loading_() {
		while (!obsidianApp(this.app).plugins?.plugins['note-chain']) {
			await new Promise(resolve => window.setTimeout(resolve, 100)); // 等待100ms再检查
		}

		void obsidianApp(this.app).commands.executeCommandById(
			"dataview:dataview-force-refresh-views"
		);

		let target = obsidianApp(this.app).plugins.getPlugin("obsidian-tasks-plugin") as {
			cache?: { notifySubscribers: () => unknown };
		} | null;
		target && void target.cache?.notifySubscribers();

		return noteChainPlugin(this.app);
	}

	async _onload_() {
		this.status = 'loading'
		this.debug = true;
		await this.loadSettings();

		this.easyapi = new EasyAPI(this.app);

		this.utils = ncUtils;
		this.ob = obsidianApi;
		
		this.chain = new NoteChain(
			this,
			this.settings.notechain.field_of_prevnote, this.settings.notechain.field_of_nextnote
		);
		this.explorer = new NCFileExplorer(this);
		this.mermaid = new MermaidGraph(this);
		this.canvas = new CanvasGraph(this);
		this.strings = new Strings();
		this.dailyjob = new DailyJob(this)
		this.webviewerllm = new WebViewerLLMModule(this);

		// HTTP/HTTPS 仅桌面端（依赖 Node crypto / fs；selfsigned 在 mobile 会因 webcrypto 崩溃）
		if (Platform.isDesktopApp) {
			const nodePath = desktopNode<NodePathModule>("path");
			if (nodePath) {
			const vaultRoot = vaultBasePath(this.app);
			const configDirAbs = nodePath.join(vaultRoot, this.app.vault.configDir);
			this.httpServer = new HTTPServer(
				this.app,
				this.easyapi.tpl,
				configDirAbs,
				this.settings.notechain.httpServerHost,
				this.settings.notechain.httpServerPort
			);
			if (this.settings.notechain.httpServerEnabled) {
				const nc = this.settings.notechain;
				const https = !!nc.httpServerHttpsEnabled;
				const http = !!nc.httpServerHttpEnabled;
				if (https || http) {
					this.httpServer.start({ https, http })
						.then(() => {
							const srv = this.httpServer;
							if (srv && https) {
								installWebviewTlsTrust(
									getWebViewerPartition(this.app),
									srv.getPort(),
									srv.getTlsDir(),
								);
							}
						})
						.catch((error) => {
							console.error('Failed to start HTTP Server:', error);
							if (this.debug) {
								new Notice(`Failed to start HTTP Server: ${error.message}`, 5000);
							}
						});
				}
			}
			}
		}

		addCommands(this);

		this.addSettingTab(new NCSettingTab(this.app, this));

		addEvents(this);

		this.registerView(
			'note-content-view',
			(leaf) => new NoteContentView(leaf, this)
		);


		this.wordcount = new WordCount(this, this.app);
		this.textarea = new NCTextarea(this);
		this.status = 'loaded'
	}


	onunload() {
		if (this._autoNotechainTimers) {
			for (const timer of this._autoNotechainTimers.values()) {
				window.clearTimeout(timer);
			}
			this._autoNotechainTimers.clear();
			this._autoNotechainPending?.clear();
		}
		this.explorer.unregister();
		// Plugin.onunload 必须同步返回；停 HTTP 后再 sort，避免退出时端口仍占用
		const explorer = this.explorer;
		const http = this.httpServer;
		if (http) {
			void http.stop()
				.catch((e: unknown) => {
					console.error('Note Chain: HTTP server stop failed', e);
				})
				.then(() => explorer.sort());
		} else {
			void explorer.sort();
		}
	}

	ufunc_on_file_open(file: TFile | null) {
		if (file?.basename == 'note-chain-templater-target') {
			return;
		}
		if (this.settings.notechain.refreshDataView) {
			void obsidianApp(this.app).commands.executeCommandById(
				"dataview:dataview-force-refresh-views"
			);
		}
		if (this.settings.notechain.refreshTasks) {
			let target = obsidianApp(this.app).plugins.getPlugin("obsidian-tasks-plugin") as {
				cache?: { notifySubscribers: () => unknown };
			} | null;
			target && void target.cache?.notifySubscribers();
		}
	}

	/** Debounced entry: coalesce bulk create/sync into one fill per folder. */
	schedule_auto_notechain(file: TFile, delayMs = 500) {
		if (!this.settings.notechain.auto_notechain) { return; }
		if (!(file instanceof TFile) || !this.wordcount.filter(file)) { return; }
		const folderPath = file.parent?.path ?? '';
		if (!this._autoNotechainTimers) {
			this._autoNotechainTimers = new Map();
		}
		this._autoNotechainPending = this._autoNotechainPending || new Map();
		this._autoNotechainPending.set(folderPath, file);
		const prev = this._autoNotechainTimers.get(folderPath);
		if (prev != null) { window.clearTimeout(prev); }
		const timer = window.setTimeout(() => {
			this._autoNotechainTimers?.delete(folderPath);
			const pending = this._autoNotechainPending?.get(folderPath);
			this._autoNotechainPending?.delete(folderPath);
			if (pending) {
				void this.auto_notechain(pending);
			}
		}, delayMs);
		this._autoNotechainTimers.set(folderPath, timer);
	}

	/**
	 * Only fill gaps: never reshape an existing sibling chain.
	 * Triggered on create / move-into-folder (not on every file-open).
	 */
	async auto_notechain(file: TFile) {
		if (!(file instanceof TFile)) { return; }
		if (!this.wordcount.filter(file)) { return; }
		if (file.basename.contains('.sync-conflict')) { return; }

		const folderPath = file.parent?.path ?? '';
		this._autoNotechainBusy = this._autoNotechainBusy || new Set();
		if (this._autoNotechainBusy.has(folderPath)) { return; }
		this._autoNotechainBusy.add(folderPath);
		try {
			let notes: TFile[] = this.easyapi.file.get_brothers(file);
			notes = notes.filter((x: TFile) =>
				this.wordcount.filter(x) && !x.basename.contains('.sync-conflict')
			);
			if (notes.length == 0) { return; }

			const changed = await this.chain.chain_fill_folder_orphans(file, notes);
			if (file.parent) {
				this.chain.refresh_folder(file.parent);
			}
			if (changed) {
				await this.explorer?.sort();
			}
		} finally {
			this._autoNotechainBusy.delete(folderPath);
		}
	}

	async loadSettings() {
		this.settings = Object.assign(
			{}, 
			{'notechain': NCSettings_DEFAULT}, 
			{'webviewllm': WebViewLLMSettings_DEFAULT},
			await this.loadData()
		);
		const nc = this.settings.notechain;
		if (nc.httpServerHttpsEnabled == null) {
			nc.httpServerHttpsEnabled = nc.httpServerEnabled !== false;
		}
		if (nc.httpServerHttpEnabled == null) {
			nc.httpServerHttpEnabled = nc.httpServerEnabled !== false;
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async clear_inlinks(tfile = this.chain.current_note, mode = 'suggester') {
		if (tfile == null) { return; }
		let notes = this.easyapi.file.get_inlinks(tfile);
		if (notes.length) {
			let op: string | [string, string] = mode;
			if (mode === 'suggester') {
				const picked = await this.easyapi.dialog_suggest(
					["delete links", 'replace links', "delete paragraph with links",],
					[['link', 'del'], ['link', 'rep'], ['para', 'del']] as [string, string][]
				);
				if (!picked) { return; }
				op = picked;
			}
			const kind = op[0];
			const action = op[1];
			let reg = this.easyapi.editor.regexp_link(tfile, kind);
			if (reg) {
				for (let note of notes) {
					let target;
					if (action === 'rep') {
						target = tfile.basename;
					} else {
						target = ''
					}
					await this.easyapi.editor.replace(note, reg, target);
				}
			}
		}
	}

	async cmd_chain_insert_node() {

		let selector = document.querySelectorAll(
			'.tree-item-self.is-selected'
		)
		let items = Object.values(selector).map((x) => (x as HTMLElement).dataset?.path)
		let tfiles = items.map(x => this.easyapi.file.get_tfile(x ?? null)).filter((x): x is TFile => x instanceof TFile && x.extension == 'md')
		if (tfiles.length > 1) {
			await moveSelectedNotesAsNext(this, tfiles, { alignConfluenceTab: false });
			return
		}

		let curr = this.chain.current_note;
		if (curr == null) { return; }
		const modeKey = this.settings.notechain.suggesterNotesMode as keyof Strings;
		let smode = this.strings[modeKey];
		let notes = await this.chain.suggester_notes(curr, false, smode);
		if (!notes) { return }
		notes = this.chain.sort_tfiles(notes, ['mtime', 'x']);
		notes = this.chain.sort_tfiles_by_chain(notes).filter((f): f is TFile => f instanceof TFile);
		//notes = notes.filter(f=>f!=curr);
		//为0时也显示，否则以为是bug
		//if(notes.length==0){return;}
		const note = await this.easyapi.dialog_suggest(
			this.utils.array_prefix_id(
				notes.map((file: TFile) => this.tfile_to_string(file, [], ""))
			),
			notes
		);

		if (!note) { return; }

		let sitems = [
			this.strings.item_insert_node_after,
			this.strings.item_insert_node_before,
			this.strings.item_insert_node_as_head,
			this.strings.item_insert_node_as_tail,
			this.strings.item_insert_folder_after,
		];
		let mode = await this.easyapi.dialog_suggest(
			this.utils.array_prefix_id(sitems),
			sitems, false, this.strings.item_insert_suggester
		);

		if (!mode) { return; }

		if (mode === this.strings.item_insert_node_as_head) {
			await this.chain.chain_insert_node_as_head(curr, note);
		} else if (mode === this.strings.item_insert_node_as_tail) {
			await this.chain.chain_insert_node_as_tail(curr, note);
		} else if (mode === this.strings.item_insert_node_before) {
			await this.chain.chain_insert_node_before(curr, note);
			await this.editor.set_frontmatter_align_file(
				note,
				curr,
				this.settings.notechain.field_of_confluence_tab_format
			)
		} else if (mode === this.strings.item_insert_node_after) {
			await this.chain.chain_insert_node_after(curr, note);
			await this.editor.set_frontmatter_align_file(
				note,
				curr,
				this.settings.notechain.field_of_confluence_tab_format
			)
		} else if (mode === this.strings.item_insert_folder_after) {
			await this.chain.chain_insert_folder_after(curr, note);
		} else {
			return;
		}
	}

	tfile_to_string(tfile: TFile, fields: Array<string>, seq: string) {
		let items: unknown[] = [];
		if (tfile == this.chain.current_note) {
			items.push('🏠' + tfile.basename)
		} else {
			items.push(tfile.basename)
		}

		for (let field of fields) {
			try {
				items.push(this.editor.get_frontmatter(tfile, field));
			} catch {
				items.push("-");
			}
		}
		return items.join(seq);
	}

	async open_note_smarter() {
		// 链式调用
		let curr = this.chain.current_note;
		let notes = await this.chain.suggester_notes(curr, false)

		notes = this.chain.sort_tfiles(notes, ['mtime', 'x']);
		notes = this.chain.sort_tfiles_by_chain(notes).filter((f): f is TFile => f instanceof TFile);
		if (notes.length > 0) {
			let note = await this.easyapi.dialog_suggest(
				this.utils.array_prefix_id(
					notes.map((file: TFile) => this.chain.tfile_to_string(file))
				),
				notes
			)
			if (note) {
				await this.chain.open_note(note);
			}
		}
	}
}