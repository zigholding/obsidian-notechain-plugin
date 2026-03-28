import {
	App, Editor, MarkdownView, Modal, Notice,
	CachedMetadata,
	Plugin,
	TAbstractFile,
	moment,
	TFile, TFolder
} from 'obsidian';

import { NoteChain } from './src/NoteChain';
import { EasyEditor } from 'src/easyapi/editor';
import { NCTextarea } from './src/NCTextarea';
import { NCFileExplorer } from './src/NCFileExplorer';
import { Strings } from 'src/NoteChain/strings';
import { WordCount } from 'src/WordCount';
import { MermaidGraph, CanvasGraph } from 'src/graph';
import { NCSettingTab } from 'src/setting';
import { NCSettings_DEFAULT } from 'src/NoteChain/setting';
import { WebViewLLMSettings_DEFAULT } from 'src/WebViewerLLM/setting';
import { addCommands } from 'src/commands';
import { addEvents } from 'src/events';
import { EasyAPI } from 'src/easyapi/easyapi'
import { NoteContentView } from 'src/NCView';
import { HTTPServer } from 'src/httpServer';
import { DailyJob} from 'src/daily_job'

import {WebViewerLLMModule} from 'src/WebViewerLLM/WebViewerLLMModule';

export default class NoteChainPlugin extends Plugin {
	settings: any;
	chain: NoteChain;
	textarea: NCTextarea;
	explorer: NCFileExplorer;
	mermaid: MermaidGraph;
	canvas: CanvasGraph;
	wordcout: WordCount;
	dailyjob: DailyJob;
	webviewerllm: WebViewerLLMModule;
	strings: Strings;
	status: string;
	debug: boolean;
	utils: any;
	timerId: any;
	ob: any;
	easyapi!: EasyAPI;
	httpServer: HTTPServer | null = null;

	/** 原 NCEditor API：与 `easyapi.editor` 相同 */
	get editor(): EasyEditor {
		return this.easyapi.editor;
	}

	async onload() {
		this.status = 'waiting'
		this.app.workspace.onLayoutReady(
			async () => {
				await this._onload_();
				this._after_loading_()
			}
		)
	}

	async _after_loading_() {
		while (!(this.app as any).plugins?.plugins['note-chain']) {
			await new Promise(resolve => setTimeout(resolve, 100)); // 等待100ms再检查
		}

		(this.app as any).commands.executeCommandById(
			"dataview:dataview-force-refresh-views"
		);

		let target = await (this.app as any).plugins.getPlugin("obsidian-tasks-plugin");
		target && target.cache.notifySubscribers();

		// new Notice('Note Chain is ready!',3000)
		return (this.app as any).plugins?.plugins['note-chain']
	}

	async _onload_() {
		this.status = 'loading'
		this.debug = true;
		await this.loadSettings();

		this.easyapi = new EasyAPI(this.app);

		this.utils = require('./src/utils');
		this.ob = require('obsidian');
		
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

		// 初始化 HTTP 服务器
		this.httpServer = new HTTPServer(
			this.app,
			this.easyapi.tpl,
			this.settings.notechain.httpServerHost,
			this.settings.notechain.httpServerPort
		);
		// 如果启用，自动启动 HTTP 服务器
		if (!this.easyapi.isMobile && this.settings.notechain.httpServerEnabled) {
			this.httpServer.start()
				.then(() => {
					console.log(`HTTP Server auto-started on ${this.settings.notechain.httpServerHost}:${this.settings.notechain.httpServerPort}`);
				})
				.catch((error) => {
					console.error('Failed to start HTTP Server:', error);
					// 如果启动失败，可以考虑通知用户
					if (this.debug) {
						new Notice(`Failed to start HTTP Server: ${error.message}`, 5000);
					}
				});
		}

		addCommands(this);

		this.addSettingTab(new NCSettingTab(this.app, this));

		addEvents(this);

		this.registerView(
			'note-content-view',
			(leaf) => new NoteContentView(leaf, this)
		);


		this.wordcout = new WordCount(this, this.app);
		this.textarea = new NCTextarea(this);
		this.status = 'loaded'
	}


	async onunload() {
		await this.explorer.unregister();
		await this.explorer.sort();
		if (this.httpServer) {
			await this.httpServer.stop();
		}
	}

	async ufunc_on_file_open(file: TFile) {
		if (this.settings.notechain.refreshDataView) {
			(this.app as any).commands.executeCommandById(
				"dataview:dataview-force-refresh-views"
			)
		}
		if (this.settings.notechain.refreshTasks) {
			let target = await (this.app as any).plugins.getPlugin("obsidian-tasks-plugin");
			target && target.cache.notifySubscribers();
		}
		if (this.settings.notechain.auto_notechain) {
			await this.auto_notechain(file);
		}
	}

	async auto_notechain(file: TFile) {
		let notes = this.easyapi.file.get_brothers(file);
		if (notes.length == 0) { return; }
		if (!this.wordcout.filter(file)) { return; }
		if (this.explorer?.file_explorer) {
			notes = this.chain.sort_tfiles(notes, (this.explorer.file_explorer as any).sortOrder);
			notes = this.chain.sort_tfiles(notes, 'chain');
			let bnotes = notes.filter((x: TFile) => x.basename.contains('.sync-conflict'));
			let anotes = notes.filter((x: TFile) => !x.basename.contains('.sync-conflict'));
			notes = this.utils.concat_array(anotes, bnotes);
			if (notes.length > 0) {
				await this.chain.chain_concat_tfiles(notes);
				await this.chain.chain_set_prev(notes[0], null);
				await this.chain.chain_set_next(notes[notes.length - 1], null);
			}
			this.explorer.sort();
		}
	}

	async loadSettings() {
		this.settings = Object.assign(
			{}, 
			{'notechain': NCSettings_DEFAULT}, 
			{'webviewllm': WebViewLLMSettings_DEFAULT},
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async clear_inlinks(tfile = this.chain.current_note, mode = 'suggester') {
		if (tfile == null) { return; }
		let notes = this.easyapi.file.get_inlinks(tfile);
		if (notes.length) {
			if (mode === 'suggester') {
				mode = await this.easyapi.dialog_suggest(
					["delete links", 'replace links', "delete paragraph with links",],
					[['link', 'del'], ['link', 'rep'], ['para', 'del']]
				);
			}
			let reg = this.easyapi.editor.regexp_link(tfile, mode[0]);
			if (reg) {
				for (let note of notes) {
					let target;
					if (mode[1] === 'rep') {
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
		let items = Object.values(selector).map((x: any) => x.dataset?.path)
		let tfiles = items.map(x => this.easyapi.file.get_tfile(x)).filter(x => x.extension == 'md')
		if (tfiles.length > 1) {
			tfiles = this.chain.sort_tfiles_by_chain(tfiles)
			let notes = this.easyapi.file.get_all_tfiles()
			notes = notes.filter((x: TFile) => !tfiles.contains(x))
			let anchor = await this.chain.sugguster_note(notes)
			if (!anchor) { return }
			for (let tfile of tfiles) {
				if (tfile.parent.path != anchor.parent.path) {
					let dst = anchor.parent.path + "/" + tfile.name;
					await this.app.fileManager.renameFile(tfile, dst);
				}
				await this.chain.chain_pop_node(tfile)
			}
			tfiles.unshift(anchor)
			let anchor_next = this.chain.get_next_note(anchor);
			if (anchor_next) { tfiles.push(anchor_next) }
			await this.chain.chain_concat_tfiles(tfiles);
			return
		}

		let curr = this.chain.current_note;
		if (curr == null) { return; }
		let smode = (this.strings as any)[this.settings.notechain.suggesterNotesMode];
		let notes = await this.chain.suggester_notes(curr, false, smode);
		if (!notes) { return }
		notes = this.chain.sort_tfiles(notes, ['mtime', 'x']);
		notes = this.chain.sort_tfiles_by_chain(notes);
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
				this.settings.field_of_confluence_tab_format
			)
		} else if (mode === this.strings.item_insert_node_after) {
			await this.chain.chain_insert_node_after(curr, note);
			await this.editor.set_frontmatter_align_file(
				note,
				curr,
				this.settings.field_of_confluence_tab_format
			)
		} else if (mode === this.strings.item_insert_folder_after) {
			await this.chain.chain_insert_folder_after(curr, note);
		} else {
			return;
		}
	}

	tfile_to_string(tfile: TFile, fields: Array<string>, seq: string) {
		let items = new Array();
		if (tfile == this.chain.current_note) {
			items.push('🏠' + tfile.basename)
		} else {
			items.push(tfile.basename)
		}

		for (let field of fields) {
			try {
				items.push(this.editor.get_frontmatter(tfile, field));
			} catch (error) {
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
		notes = this.chain.sort_tfiles_by_chain(notes);
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