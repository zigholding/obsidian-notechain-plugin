import { MarkdownView, TFile } from 'obsidian';
import type { EasyAPI } from '../easyapi';
import {
	codeFenceStartsWithLanguage,
	fencedCodeInnerContent,
	fencedCodeInnerLoose,
} from './codeFence';

export class EasyEditorSections {
	/** Host EasyEditor fields/methods (filled by applyMixins). */
	[key: string]: any;

    async pickSectionFromActiveMarkdownView(): Promise<any> {
        const view = (this.app.workspace as any).getActiveFileView();
        const editor = view?.editor;
        const tfile = view?.file;
        if (!view || !editor || !tfile) { return null; }
        const cursor = editor.getCursor();
        const cache = this.app.metadataCache.getFileCache(tfile);
        if (!cache) { return; }
        if (!cursor) {
            const ctx = await this.app.vault.cachedRead(tfile);
            const items = cache?.sections?.map(
                (section: { position: { start: { offset: number }; end: { offset: number } } }) =>
                    ctx.slice(section.position.start.offset, section.position.end.offset)
            );
            if (!items) { return null; }
            const section = await this.ea.dialog_suggest(items, cache.sections);
            return section;
        }
        return cache?.sections?.filter(
            (x: { position: { start: { line: number }; end: { line: number } } }) =>
                x.position.start.line <= cursor.line && x.position.end.line >= cursor.line
        )[0];
    }

    async get_selection(cancel_selection = false) {
        let editor = (this.app.workspace as any).getActiveFileView()?.editor;
        if (editor) {
            let sel = editor.getSelection();
            if (cancel_selection) {
                let cursor = editor.getCursor();
                await editor.setSelection(cursor, cursor);
            }
            if (sel) {
                return sel;
            }
        }

        // WebViewer plugin selection lives inside its webview context.
        const wv = this.ea?.wv?.basewv;
        const activeView = wv?.activeView as any;
        const webview = activeView?.webview ?? wv?.webview;
        if (webview?.executeJavaScript) {
            try {
                const webSel = await webview.executeJavaScript(
                    `
                (() => {
                    const sel = window.getSelection?.();
                    if (sel && !sel.isCollapsed) {
                        const text = sel.toString();
                        if (text) return text;
                    }
                    const ae = document.activeElement;
                    if (ae instanceof HTMLTextAreaElement || ae instanceof HTMLInputElement) {
                        const start = ae.selectionStart ?? 0;
                        const end = ae.selectionEnd ?? 0;
                        const text = ae.value?.slice(start, end) || '';
                        if (text) return text;
                    }
                    return '';
                })()
                `
                );
                if (webSel) {
                    if (cancel_selection) {
                        await webview.executeJavaScript(
                            `
                        (() => {
                            const sel = window.getSelection?.();
                            if (sel) {
                                sel.removeAllRanges();
                            }
                            const ae = document.activeElement;
                            if (ae instanceof HTMLTextAreaElement || ae instanceof HTMLInputElement) {
                                const p = ae.selectionEnd ?? ae.value.length;
                                ae.setSelectionRange?.(p, p);
                                ae.blur?.();
                            }
                        })()
                        `
                        );
                    }
                    return webSel;
                }
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                // Electron: executeJavaScript before dom-ready / while detached throws.
                if (!msg.includes('dom-ready') && !msg.includes('WebView must be attached')) {
                    return '';
                }
            }
        }

        let selection = window.getSelection();
        if (selection && !selection.isCollapsed) {
            const selectedText = selection.toString();
            if (selectedText) {
                return selectedText;
            }
        }
        let areas = document.querySelectorAll('textarea');
        for (let area of Array.from(areas)) {
            let sel = area.value.slice(area.selectionStart, area.selectionEnd);

            if (sel) {
                if (cancel_selection) {
                    area.selectionStart = area.selectionEnd;
                    area.blur();
                }
                return sel
            }
        }
        return ''

    }

    async get_code_section(tfile: TFile, ctype = '', idx = 0, as_simple = true) {
        let dvmeta = this.app.metadataCache.getFileCache(tfile);
        let ctx = await this.app.vault.cachedRead(tfile);

        let sections = dvmeta?.sections
            ?.filter((x: any) => x.type == 'code')
            .filter((x: any) => {
                let c = ctx.slice(x.position.start.offset, x.position.end.offset).trim();
                return codeFenceStartsWithLanguage(c, ctype);
            });

        if (!sections || sections.length == 0) {
            return null;
        }

        let selected: any;

        if(sections.length==1){
            selected = sections[0];
        }else if (idx >= 2 && sections[idx]) {
            selected = sections[idx];
        } else {
            let sel = await this.ea.dialog_suggest(
                sections.map((x: any) => ctx.slice(x.position.start.offset, x.position.end.offset)),
                [...Array(sections.length).keys()]
            );
            if (sel == null) return;
            selected = sections[sel];
        }

        // Now safely use selected
        let c = ctx.slice(
            selected.position.start.offset,
            selected.position.end.offset
        );

        if (as_simple) {
            let inner =
                fencedCodeInnerContent(c) ??
                fencedCodeInnerLoose(c);
            if (inner === null) {
                const o = c.match(/^(`{3,}|~{3,})/);
                const n = o?.[1].length ?? 3;
                inner = c.slice(n + ctype.length + 1, c.length - n);
            }
            return inner;
        } else {
            return {
                code: c,
                section: selected,
                ctx: ctx
            };
        }
    }

    get_heading_ctx(ctx: string, headings: any[], heading: any, with_heading = true) {
        // 找到 heading 在 headings 中的位置
        if(!heading){return ''}
        let idx = headings.indexOf(heading);
        let nextIdx = idx + 1;

        // 找下一个同级或更高的 heading（level <= target.level）
        while (nextIdx < headings.length) {
            if (headings[nextIdx].level <= heading.level) {
                break;
            }
            nextIdx++;
        }

        // 起点
        let start = with_heading
            ? heading.position.start.offset
            : heading.position.end.offset;

        // 终点：如果找到下一个 heading
        if (nextIdx < headings.length) {
            let nextSec = headings[nextIdx];
            return ctx.slice(start, nextSec.position.start.offset);
        }

        // 没有更下一级 heading，截到文末
        return ctx.slice(start);
    }


    async get_heading_section(tfile: TFile, heading: string, idx = 0, with_heading = true) {
        tfile = this.ea.file.get_tfile(tfile);
        if(!tfile){
            return '';
        }
        let dvmeta = this.app.metadataCache.getFileCache(tfile);
        let ctx = await this.app.vault.cachedRead(tfile);

        if (!dvmeta?.headings) {
            return '';
        }

        // 找到所有匹配开头的 headings
        let sections = dvmeta.headings.filter((x: any) => x.heading==heading);

        if (sections.length === 0) return '';

        let selected: any;

        // idx >= 0 时直接取
        if(sections.length==1){
            selected = sections[0];
        }else if (idx >= 2 && sections[idx]) {
            selected = sections[idx];
        } else {
            // 弹窗选择
            const choices = sections.map((x: any) =>
                this.get_heading_ctx(ctx,dvmeta?.headings??[],x,with_heading)
            );

            const nums = [...Array(sections.length).keys()];
            let sel = await this.ea.dialog_suggest(choices, nums);

            if (sel == null) return;
            selected = sections[sel];
        }
        return this.get_heading_ctx(ctx,dvmeta.headings??[],selected,with_heading).trim();
    }


    async get_current_section(with_section = false) {
        let editor = this.ea.ceditor;
        let tfile = this.ea.cfile;
        if (!editor || !tfile) { return null }
        let cursor = editor.getCursor();
        let cache = this.app.metadataCache.getFileCache(tfile)
        if (!cache || !cache?.sections) { return null }
        if (cursor) {
            let section = cache?.sections?.filter(
                (x: any) => { return x.position.start.line <= cursor.line && x.position.end.line >= cursor.line }
            )[0]
            if (!section && cursor.line > cache.sections[cache.sections.length - 1].position.end.line) {
                section = cache.sections[cache.sections.length - 1]
            }
            if (!section && cursor.line < cache.sections[0].position.start.line) {
                section = cache.sections[0]
            }
            if (!section) {
                return null;
            }
            let ctx = await this.app.vault.cachedRead(tfile);
            ctx = ctx.slice(
                section.position.start.offset,
                section.position.end.offset
            )
            if (with_section) {
                return {
                    'section': section,
                    'sec': ctx
                }
            } else {
                return ctx;
            }
            return
        } else {
            return null;
        }
    }

}
