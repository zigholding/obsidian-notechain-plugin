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
import { dialogCheck } from './gui/checkModal';

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

    /**
     * Yes/No 确认框。Yes 为 true，No 或关闭为 false。
     * `content` 按 Markdown 渲染。`title` 为空时用「确认」。
     */
    dialog_check(title: string, content: string): Promise<boolean> {
        return dialogCheck(this.app, title, content);
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
