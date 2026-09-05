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

class NoteChainClass {
	plugin: NoteChainPlugin;
	app: App;
	prev: string;
	next: string;
	children: Record<string, TAbstractFile[]>;
	init_children!: () => void;

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

export interface NoteChain extends
	NoteChainClass,
	NoteChainFolderChildren,
	NoteChainNavigation,
	NoteChainChainOps,
	NoteChainMisc {}

export const NoteChain = NoteChainClass as {
	new (
		plugin: NoteChainPlugin,
		prev?: string,
		next?: string,
	): NoteChain;
};

applyMixins(NoteChainClass, [
	NoteChainFolderChildren,
	NoteChainNavigation,
	NoteChainChainOps,
	NoteChainMisc,
]);
