import { App, parseYaml } from 'obsidian';
import { EasyAPI } from 'src/easyapi/easyapi';

import { EasyEditorFrontmatter } from './editor/frontmatter';
import { EasyEditorListParse } from './editor/listParse';
import { EasyEditorBlocks } from './editor/blocks';
import { EasyEditorSections } from './editor/sections';
import { EasyEditorObjPath } from './editor/objPath';
import { EasyEditorClipboard } from './editor/clipboard';
import { applyMixins } from '../ts-helpers';

export interface EasyEditor extends
	EasyEditorFrontmatter,
	EasyEditorListParse,
	EasyEditorBlocks,
	EasyEditorSections,
	EasyEditorObjPath,
	EasyEditorClipboard {}

export class EasyEditor {
    yamljs = { load: (src: string) => parseYaml(src) };
    app: App;
    ea: EasyAPI;
    /** set_frontmatter / set_multi_frontmatter 默认重试次数 */
    nretry = 10;

    constructor(app: App, api: EasyAPI) {
        this.app = app;
        this.ea = api;
    }
}

applyMixins(EasyEditor, [
	EasyEditorFrontmatter,
	EasyEditorListParse,
	EasyEditorBlocks,
	EasyEditorSections,
	EasyEditorObjPath,
	EasyEditorClipboard,
]);
