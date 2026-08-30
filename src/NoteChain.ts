import {
	App,
} from 'obsidian';

import NoteChainPlugin from "./plugin";

import { NoteChainFolderChildren } from './NoteChain/folderChildren';
import { NoteChainNavigation } from './NoteChain/navigation';
import { NoteChainChainOps } from './NoteChain/chainOps';
import { NoteChainMisc } from './NoteChain/misc';

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
	children: { [key: string]: any };

	constructor(plugin: NoteChainPlugin,
		prev = "PrevNote", next = "NextNote",
	) {
		this.plugin = plugin;
		this.app = plugin.app;
		(window as any).nc = this.plugin;

		this.prev = prev;
		this.next = next;
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
	NoteChainMisc,
]);
