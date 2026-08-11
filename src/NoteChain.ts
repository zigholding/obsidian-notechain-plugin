import {
	App,
} from 'obsidian';

import NoteChainPlugin from "./plugin";
import { NoteEditorModal } from './NCModal'
import { LexoRank } from "lexorank";

import { NoteChainFolderChildren } from './NoteChain/folderChildren';
import { NoteChainNavigation } from './NoteChain/navigation';
import { NoteChainChainOps } from './NoteChain/chainOps';
import { NoteChainLexorank } from './NoteChain/lexorank';
import { NoteChainMisc } from './NoteChain/misc';

export interface NoteChain extends
	NoteChainFolderChildren,
	NoteChainNavigation,
	NoteChainChainOps,
	NoteChainLexorank,
	NoteChainMisc {}

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
}

function applyMixins(derivedCtor: any, constructors: any[]) {
	constructors.forEach((baseCtor) => {
		Object.getOwnPropertyNames(baseCtor.prototype).forEach((name) => {
			if (name === 'constructor') return;
			Object.defineProperty(
				derivedCtor.prototype,
				name,
				Object.getOwnPropertyDescriptor(baseCtor.prototype, name) as PropertyDescriptor
			);
		});
	});
}

applyMixins(NoteChain, [
	NoteChainFolderChildren,
	NoteChainNavigation,
	NoteChainChainOps,
	NoteChainLexorank,
	NoteChainMisc,
]);
