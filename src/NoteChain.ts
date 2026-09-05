import {
	App,
	TAbstractFile,
} from 'obsidian';

import NoteChainPlugin from "./plugin";

import { NoteChainFolderChildren } from './NoteChain/folderChildren';
import { NoteChainNavigation } from './NoteChain/navigation';
import { NoteChainChainOps } from './NoteChain/chainOps';
import { NoteChainMisc } from './NoteChain/misc';
import { applyMixins } from './ts-helpers';

export interface NoteChain extends
	NoteChainFolderChildren,
	NoteChainNavigation,
	NoteChainChainOps,
	NoteChainMisc {}

export class NoteChain {
	plugin: NoteChainPlugin;
	app: App;
	prev: string;
	next: string;
	children: Record<string, TAbstractFile[]>;

	constructor(plugin: NoteChainPlugin,
		prev = "PrevNote", next = "NextNote",
	) {
		this.plugin = plugin;
		this.app = plugin.app;
		window.nc = this.plugin;

		this.prev = prev;
		this.next = next;
		this.children = {};
		this.init_children();

	}
}

applyMixins(NoteChain, [
	NoteChainFolderChildren,
	NoteChainNavigation,
	NoteChainChainOps,
	NoteChainMisc,
]);
