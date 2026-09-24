import { App, parseYaml, stringifyYaml } from 'obsidian';
import { EasyAPI } from 'src/easyapi/easyapi';

import { EasyEditorFrontmatter } from './editor/frontmatter';
import { EasyEditorListParse } from './editor/listParse';
import { EasyEditorBlocks } from './editor/blocks';
import { EasyEditorSections } from './editor/sections';
import { EasyEditorObjPath } from './editor/objPath';
import { EasyEditorClipboard } from './editor/clipboard';
import { EasyEditorSort } from './editor/sort';
import { applyMixins } from '../ts-helpers';

export interface EasyEditor extends
	EasyEditorClass,
	EasyEditorFrontmatter,
	EasyEditorListParse,
	EasyEditorBlocks,
	EasyEditorSections,
	EasyEditorObjPath,
	EasyEditorClipboard,
	EasyEditorSort {}

class EasyEditorClass {
    yamljs = {
        load: (src: string) => parseYaml(src),
        dump: (obj: unknown) => stringifyYaml(obj),
    };
    app: App;
    ea: EasyAPI;
    /** set_frontmatter / set_multi_frontmatter 默认重试次数 */
    nretry = 10;

    constructor(app: App, api: EasyAPI) {
        this.app = app;
        this.ea = api;
    }
}

export const EasyEditor = EasyEditorClass as {
	new (app: App, api: EasyAPI): EasyEditor;
};

applyMixins(EasyEditorClass, [
	EasyEditorFrontmatter,
	EasyEditorListParse,
	EasyEditorBlocks,
	EasyEditorSections,
	EasyEditorObjPath,
	EasyEditorClipboard,
	EasyEditorSort,
]);
