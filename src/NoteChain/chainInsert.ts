import { TFile } from 'obsidian';

import type NoteChainPlugin from '../plugin';

/**
 * Multi-select: insert sorted notes after a chosen anchor.
 * Shared by Insert-node command and File menu "Move as next notes".
 */
export async function moveSelectedNotesAsNext(
	plugin: NoteChainPlugin,
	tfiles: TFile[],
	opts?: {
		/** File menu aligns confluence tab; command multi-path does not. */
		alignConfluenceTab?: boolean;
	}
): Promise<boolean> {
	if (!tfiles || tfiles.length < 2) { return false; }

	tfiles = plugin.chain.sort_tfiles_by_chain(tfiles) as TFile[];
	let notes = plugin.easyapi.file.get_all_tfiles();
	notes = notes.filter((x: TFile) => !tfiles.contains(x));
	const anchor = await plugin.chain.sugguster_note(notes);
	if (!anchor) { return false; }

	for (let tfile of tfiles) {
		if (tfile.parent && tfile.parent.path != anchor.parent.path) {
			const dst = anchor.parent.path + '/' + tfile.name;
			await plugin.app.fileManager.renameFile(tfile, dst);
		}
		await plugin.chain.chain_pop_node(tfile);
	}
	tfiles.unshift(anchor);
	const anchor_next = plugin.chain.get_next_note(anchor);
	if (anchor_next) { tfiles.push(anchor_next); }
	await plugin.chain.chain_concat_tfiles(tfiles);

	if (opts?.alignConfluenceTab) {
		for (let dst of tfiles.slice(1, tfiles.length - 1)) {
			await plugin.editor.set_frontmatter_align_file(
				anchor, dst, plugin.settings.notechain.field_of_confluence_tab_format
			);
		}
	}
	return true;
}
