


import { App, TAbstractFile, TFile } from 'obsidian';

import { EasyAPI } from 'src/easyapi/easyapi'

export class EasyEditor {
    yamljs = require('js-yaml');
    app: App;
    ea: EasyAPI;
    /** set_frontmatter / set_multi_frontmatter 默认重试次数 */
    nretry = 10;

    constructor(app: App, api: EasyAPI) {
        this.app = app;
        this.ea = api;
    }

    async set_frontmatter(
        tfile: TFile | string | Array<TFile | string>,
        key: string,
        value: any,
        nretry = this.nretry
    ): Promise<boolean> {
        const kv: { [key: string]: string } = {};
        kv[key] = value;
        return this.set_multi_frontmatter(tfile, kv, nretry);
    }

    check_frontmatter(tfile: TFile, kv: { [key: string]: any }): boolean {
        try {
            if (!tfile) { return false; }
            const meta = this.app.metadataCache.getFileCache(tfile);
            if (meta?.frontmatter) {
                for (const k in kv) {
                    if (!(meta.frontmatter[k] == kv[k])) {
                        return false;
                    }
                }
                return true;
            }
            return false;
        } catch {
            return false;
        }
    }

    async wait_frontmatter(tfile: TFile, kv: { [key: string]: any }, timeout = 3000): Promise<boolean> {
        if (this.check_frontmatter(tfile, kv)) return true;

        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                this.app.metadataCache.offref(off);
                resolve(false);
            }, timeout);

            const off = this.app.metadataCache.on('changed', (file) => {
                if (file.path === tfile.path && this.check_frontmatter(tfile, kv)) {
                    clearTimeout(timer);
                    this.app.metadataCache.offref(off);
                    resolve(true);
                }
            });
        });
    }

    async set_multi_frontmatter(
        tfile: TFile | string | Array<TFile | string>,
        kv: { [key: string]: any },
        nretry = this.nretry
    ): Promise<boolean> {
        if (Array.isArray(tfile)) {
            for (const item of tfile) {
                const ok = await this.set_multi_frontmatter(item, kv, nretry);
                if (!ok) return false;
            }
            return true;
        }

        if (typeof tfile === 'string') {
            tfile = this.ea.file.get_tfile(tfile) as TFile;
        }

        if (!tfile || !(tfile instanceof TFile)) {
            return false;
        }

        if (this.check_frontmatter(tfile, kv)) return true;

        for (let attempt = 0; attempt < nretry; attempt++) {
            await this.app.fileManager.processFrontMatter(tfile, (fm) => {
                for (const k in kv) {
                    this.set_obj_value(fm, k, kv[k]);
                }
            });

            const ok = await this.wait_frontmatter(tfile, kv, 1000);
            if (ok) return true;
        }

        return false;
    }

    get_frontmatter(tfile: TFile, key: string): any {
        try {
            if (!tfile) { return null; }
            const meta = this.app.metadataCache.getFileCache(tfile);
            if (meta?.frontmatter) {
                if (meta.frontmatter[key]) {
                    return meta.frontmatter[key];
                }
                const keys = key.split('.');
                let cfm: any = meta.frontmatter;
                for (const k of keys) {
                    const items = k.match(/^(.*?)(\[-?\d+\])?$/);
                    if (!items) { return null; }
                    if (items[1]) {
                        cfm = cfm[items[1]];
                    }
                    if (!cfm) { return null; }
                    if (Array.isArray(cfm) && items[2]) {
                        let i = parseInt(items[2].slice(1, items[2].length - 1));
                        if (i < 0) {
                            i = i + cfm.length;
                        }
                        cfm = cfm[i];
                    }
                }
                return cfm;
            }
        } catch {
            return null;
        }
    }

    get_vault_name(): string {
        let items = (this.app.vault.adapter as any).basePath.split('\\');
        items = items[items.length - 1].split('/');
        return items[items.length - 1];
    }

    get_frontmatter_config(tfile: TAbstractFile, key: string): any {
        if (tfile instanceof TFile) {
            if (tfile.extension == 'md') {
                const config = this.get_frontmatter(tfile, key);
                if (config) { return config; }
            } else {
                const file = this.ea.file.get_tfile(
                    tfile.path.slice(0, tfile.path.length - tfile.extension.length) + 'md'
                );
                if (file) {
                    const config = this.get_frontmatter(file, key);
                    if (config) { return config; }
                }
            }
        } else {
            const file = this.ea.file.get_tfile(tfile.path + '/' + tfile.name + '.md');
            if (file) {
                let config = this.get_frontmatter(file, key + '_folder');
                if (config) { return config; }
                config = this.get_frontmatter(file, key);
                if (config) { return config; }
            }
        }

        let dir: TAbstractFile | null = tfile.parent;
        while (dir) {
            let cfile: TFile | null;
            if (dir.parent) {
                cfile = this.ea.file.get_tfile(dir.path + '/' + dir.name + '.md');
            } else {
                cfile = this.ea.file.get_tfile(this.get_vault_name());
            }
            const config = cfile ? this.get_frontmatter(cfile, key) : null;
            if (config) { return config; }
            dir = dir.parent;
        }
        return null;
    }

    /** 基于活动 Markdown 视图：光标所在 section，或无光标时弹窗选择 section */
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

    async set_frontmatter_align_file(src: TFile, dst: TFile, field: string) {
        if (field) {
            const value = this.get_frontmatter(src, field);
            if (value) {
                await this.set_frontmatter(dst, field, value, 1);
            }
        }
    }

    cn2num(chinese: string) {
        let v = parseFloat(chinese);
        if (!Number.isNaN(v)) { return v }

        chinese = chinese.trim()
        const cnNumbers: { [key: string]: number } = {
            "零": 0, "一": 1, "二": 2, "三": 3, "四": 4,
            "五": 5, "六": 6, "七": 7, "八": 8, "九": 9,
            "十": 10, "百": 100, "千": 1000, "万": 10000
        };

        let sign = 1.0;
        let i = 0;

        // 处理负号（JavaScript中汉字是双字节字符）
        if (i + 1 <= chinese.length && chinese[i] === "负") {
            sign = -1.0;
            i += 1;
        }

        let integer_total = 0;
        let decimal_total = 0.0;
        let temp = 0;
        let processing_decimal = false;
        let decimal_factor = 0.1;

        while (i < chinese.length) {
            const c = chinese[i];
            i += 1;

            // 处理小数点
            if (c === "点") {
                processing_decimal = true;
                integer_total += temp;
                temp = 0;
                continue;
            }
            if (!(c in cnNumbers)) {
                return parseFloat('-')
            }
            if (!processing_decimal) {
                // 整数部分处理
                if (cnNumbers.hasOwnProperty(c)) {
                    const num = cnNumbers[c];

                    if (num >= 10) {  // 处理单位
                        if (temp === 0 && num === 10) {
                            integer_total += 1 * num;  // 特殊处理"十"前无数字的情况
                        } else {
                            integer_total += temp * num;
                        }
                        temp = 0;  // 重置temp
                    } else {       // 处理数字
                        temp = temp * 10 + num;
                    }
                }
            } else {
                // 小数部分处理
                if (cnNumbers.hasOwnProperty(c) && cnNumbers[c] < 10) {
                    decimal_total += cnNumbers[c] * decimal_factor;
                    decimal_factor *= 0.1;
                }
            }
        }

        // 处理最后的临时值
        integer_total += temp;

        return sign * (integer_total + decimal_total);
    }

    slice_by_position(ctx: string, pos: any) {
        if (pos.position) {
            pos = pos.position
        }
        return ctx.slice(pos.start.offset, pos.end.offset);
    }

    parse_list_regx(aline: string, regx: RegExp, field: { [key: string]: number } = {}) {
        let match = aline.match(regx);
        if (!match) { return null }
        let res: { [key: string]: string } = { src: aline }
        for (let k in field) {
            res[k] = match[field[k]]
        }
        return res
    }

    parse_list_dataview(aline: string, src = '_src_') {
        let res: { [key: string]: string } = {};
        if (src) {
            res[src] = aline;
        }
        let regex = /[($$](.*?)::(.*?)[)$$]/g;
        let match;
        while ((match = regex.exec(aline)) !== null) {
            let key = match[1].trim();  // 提取 key 并去除两端空格
            let value = match[2].trim(); // 提取 value 并去除两端空格
            res[key] = value;
        }
        return res;
    }

    keys_in(keys: Array<string>, obj: object) {
        for (let k of keys) {
            if (!(k in obj)) {
                return false
            }
        }
        return true;
    }

    async extract_code_block(tfile: TFile | string, btype: string | string[]) {
        let xfile = this.ea.file.get_tfile(tfile);
        if (xfile) {
            tfile = await this.app.vault.cachedRead(xfile);
        }
        if (typeof (tfile) != 'string') { return [] }

        const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const types = (Array.isArray(btype) ? btype : [btype])
            .map(x => (x ?? '').trim())
            .filter(Boolean);
        if (types.length === 0) { return [] }

        const fenceInfo = types.length === 1
            ? escapeRegExp(types[0])
            : `(?:${types.map(escapeRegExp).join('|')})`;

        let blocks = [];
        let reg = new RegExp(String.raw`\`\`\`${fenceInfo}\r?\n([\s\S]*?)\r?\n\`\`\``, 'g');
        let matches;
        while ((matches = reg.exec(tfile)) !== null) {
            blocks.push(matches[1].trim());
        }

        reg = new RegExp(String.raw`~~~${fenceInfo}\r?\n([\s\S]*?)\r?\n~~~`, 'g');
        while ((matches = reg.exec(tfile)) !== null) {
            blocks.push(matches[1].trim());
        }
        return blocks;
    }

    /** `[[note|alias]]` 或整段匹配的正则 */
    regexp_link(tfile: TFile, mode: string): RegExp | undefined {
        if (mode === 'link') {
            return new RegExp(`\\[\\[${tfile.basename}\\|?.*\\]\\]`, 'g');
        }
        if (mode === 'para') {
            return new RegExp(`.*\\[\\[${tfile.basename}\\|?.*\\]\\].*`, 'g');
        }
    }

    async replace(tfile: TFile, regex: string | RegExp, target: string) {
        if (typeof regex === 'string') {
            await this.app.vault.process(tfile, (data) => {
                if (data.indexOf(regex) > -1) {
                    return data.replace(regex, target);
                }
                return data;
            });
        } else if (regex instanceof RegExp) {
            await this.app.vault.process(tfile, (data) => {
                if (data.match(regex)) {
                    return data.replace(regex, target);
                }
                return data;
            });
        }
    }

    /** 去掉 YAML frontmatter，返回正文；`string` 视为已是全文内容（不按路径解析） */
    async remove_metadata(tfile: TFile | string): Promise<string> {
        if (tfile instanceof TFile) {
            tfile = await this.app.vault.cachedRead(tfile);
        }
        if (typeof tfile != 'string') {
            return '';
        }
        const headerRegex = /^---\s*([\s\S]*?)\s*---/;
        const match = headerRegex.exec(tfile);
        if (match) {
            tfile = tfile.slice(match[0].length).trim();
        }
        return tfile;
    }

    async extract_templater_block(tfile: TFile | string, reg = /<%\*\s*([\s\S]*?)\s*-?%>/g): Promise<string[]> {
        let xfile = this.ea.file.get_tfile(tfile);
        if (xfile) {
            tfile = await this.app.vault.cachedRead(xfile);
        }
        if (typeof tfile != 'string') {
            return [];
        }
        const cssCodeBlocks: string[] = [];
        let matches: RegExpExecArray | null;
        while ((matches = reg.exec(tfile)) !== null) {
            cssCodeBlocks.push(matches[0].trim());
        }
        const tpls = await this.extract_code_block(tfile, [
            'js //templater',
            'js templater',
            'js tpl',
            'js //tpl'
        ]);
        for (const tpl of tpls) {
            cssCodeBlocks.push(`<%*\n${tpl}\n-%>`);
        }
        return cssCodeBlocks;
    }

    async extract_yaml_block(tfile: TFile | string): Promise<string> {
        if (tfile instanceof TFile) {
            tfile = await this.app.vault.cachedRead(tfile);
        }
        if (typeof tfile != 'string') {
            return '';
        }
        const headerRegex = /^---\s*([\s\S]*?)\s*---/;
        const match = headerRegex.exec(tfile);
        if (match) {
            return match[0];
        }
        return '';
    }

    private extractBlockId(para: string): string {
        const reg = /\s+\^[a-zA-Z0-9]+\r?\n?$/;
        const match = reg.exec(para);
        if (match) {
            return match[0].trim();
        }
        return '';
    }

    private generateRandomString(length: number): string {
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            const randomIndex = Math.floor(Math.random() * characters.length);
            result += characters[randomIndex];
        }
        return result;
    }

    async extract_all_blocks(tfile: TFile | string): Promise<any[]> {
        if (tfile instanceof TFile) {
            tfile = await this.app.vault.cachedRead(tfile);
        }
        if (typeof tfile != 'string') {
            return [];
        }
        let ctx = tfile;
        const blocks: any[] = [];
        const head = await this.extract_yaml_block(ctx);
        if (head != '') {
            blocks.push(['YAML', head]);
            ctx = ctx.slice(head.length);
        }
        const kvgets: { [key: string]: RegExp } = {
            '空白段落': /^(\s*\n)*/,
            '代码块': /^[ \t]*```[\s\S]*?\n[ \t]*```[ \t]*\n(\s*\^[a-zA-Z0-9]+\r?[\n$])?/,
            'tpl代码块': /^<%\*[\s\S]*?\n-?\*?%>[ \t]*\n(\s+\^[a-zA-Z0-9]+\r?[\n$])?/,
            '任务': /^[ \t]*- \[.\].*\n?(\s+\^[a-zA-Z0-9]+\r?[\n$])?/,
            '无序列表': /^[ \t]*- .*\n?(\s+\^[a-zA-Z0-9]+\r?[\n$])?/,
            '有序列表': /^[ \t]*\d\. .*\n?(\s+[ \t]*\^[a-zA-Z0-9]+\r?[\n$])?/,
            '引用': /^(>.*\n)+(\s*\^[a-zA-Z0-9]+\r?[\n$])?/,
            '标题': /^#+ .*\n(\s*\^[a-zA-Z0-9]+\r?[\n$])?/,
            '段落': /^(.*\n?)(\s*\^[a-zA-Z0-9]+\r?[\n$])?/
        };
        while (ctx.length > 0) {
            let flag = true;
            for (const key of Object.keys(kvgets)) {
                const reg = kvgets[key];
                const match = reg.exec(ctx);
                if (match) {
                    const curr = match[0];
                    if (curr.length > 0) {
                        const bid = this.extractBlockId(curr);
                        if (key == '段落' && blocks.length > 0 && blocks[blocks.length - 1][0] == '段落') {
                            blocks[blocks.length - 1][1] = blocks[blocks.length - 1][1] + curr;
                            blocks[blocks.length - 1][2] = bid;
                        } else {
                            blocks.push([key, curr, bid]);
                        }
                        flag = false;
                        ctx = ctx.slice(curr.length);
                        break;
                    }
                }
            }
            if (flag) {
                break;
            }
        }
        if (ctx.length > 0) {
            const bid = this.extractBlockId(ctx);
            blocks.push(['段落', ctx, bid]);
        }
        return blocks;
    }

    async append_block_ids(tfile: TFile): Promise<string> {
        const blocks = await this.extract_all_blocks(tfile);
        const items: string[] = [];
        for (const block of blocks) {
            if (['空白段落', 'YAML'].contains(block[0])) {
                items.push(block[1]);
            } else if (!block[2]) {
                const bid = this.generateRandomString(6);
                if (['任务', '无序列表', '有序列表'].contains(block[0])) {
                    items.push(block[1].slice(0, -1) + ' ^' + bid + '\n');
                } else {
                    if (block[1].endsWith('\n')) {
                        items.push(block[1] + '^' + bid + '\n');
                    } else {
                        items.push(block[1] + '\n^' + bid + '\n');
                    }
                }
            } else {
                items.push(block[1]);
            }
        }
        const res = items.join('');
        await this.app.vault.modify(tfile, res);
        return res;
    }

    async remove_block_ids(tfile: TFile): Promise<string> {
        const blocks = await this.extract_all_blocks(tfile);
        const items: string[] = [];
        for (const block of blocks) {
            if (['空白段落', 'YAML'].contains(block[0])) {
                items.push(block[1]);
            } else {
                const reg = /\s+\^[a-zA-Z0-9]+\r?\n?$/;
                const match = reg.exec(block[1]);
                if (match) {
                    items.push(block[1].replace(reg, '\n'));
                } else {
                    items.push(block[1]);
                }
            }
        }
        const res = items.join('');
        await this.app.vault.modify(tfile, res);
        return res;
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
                area.selectionStart = area.selectionEnd;
                area.blur();
                return sel
            }
        }
        return ''

    }

    async get_code_section(tfile: TFile, ctype = '', idx = 0, as_simple = true) {
        let dvmeta = this.app.metadataCache.getFileCache(tfile);
        let ctx = await this.app.vault.cachedRead(tfile);

        let sections = dvmeta?.sections
            ?.filter(x => x.type == 'code')
            .filter(x => {
                let c = ctx.slice(x.position.start.offset, x.position.end.offset).trim();
                return c.startsWith('```' + ctype) || c.startsWith('~~~' + ctype);
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
                sections.map(x => ctx.slice(x.position.start.offset, x.position.end.offset)),
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
            return c.slice(4 + ctype.length, c.length - 4);
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
        let dvmeta = this.app.metadataCache.getFileCache(tfile);
        let ctx = await this.app.vault.cachedRead(tfile);

        if (!dvmeta?.headings) {
            return '';
        }

        // 找到所有匹配开头的 headings
        let sections = dvmeta.headings.filter(x => x.heading==heading);

        if (sections.length === 0) return '';

        let selected: any;

        // idx >= 0 时直接取
        if(sections.length==1){
            selected = sections[0];
        }else if (idx >= 2 && sections[idx]) {
            selected = sections[idx];
        } else {
            // 弹窗选择
            const choices = sections.map(x =>
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
                x => { return x.position.start.line <= cursor.line && x.position.end.line >= cursor.line }
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

    set_obj_value(data: any, key: string, value: any) {
        const isDelete = (value === '$DELETE');
        let items = key.trim().split('.')
        if (!items) { return }
        let curr = data
        for (let item of items.slice(0, items.length - 1)) {
            let kv = item.match(/^(.*?)(\[-?\d+\])?$/) // 匹配数组索引, 如 key[0] 或 key
            if (!kv) { return }
            let k = kv[1] // 键名
            if (kv[2]) { // 有索引
                let i = parseInt(kv[2].slice(1, kv[2].length - 1)) // 索引
                if (isDelete) {
                    // 删除模式下不创建路径, 仅在存在时向下
                    if (!(k in curr)) { return }
                    if (!Array.isArray(curr[k])) { return }
                    let arr = curr[k]
                    if (arr.length == 0) { return }
                    // 规范化索引
                    let idx = ((i % arr.length) + arr.length) % arr.length;
                    curr = arr[idx]
                } else {
                    if (!(k in curr)) { // 键不存在
                        curr[k] = [{}] // 创建空数组
                        curr = curr[k][0]
                    } else {
                        if (Array.isArray(curr[k])) {
                            let tmp = {}
                            if (i < 0) {
                                curr[k].splice(-i - 1, 0, tmp)
                            } else if (i < curr[k].length) {
                                curr[k][i] = tmp
                            } else {
                                curr[k].push(tmp)
                            }
                            curr = tmp
                        } else {
                            curr[k] = [{}]
                            curr = curr[k][0]
                        }
                    }
                }
            } else {
                if (isDelete) {
                    // 删除模式下不创建中间对象
                    if (!(k in curr)) { return }
                    if (typeof (curr[k]) != 'object' || curr[k] === null) { return }
                    curr = curr[k]
                } else {
                    if (!(k in curr)) {
                        curr[k] = {}
                        curr = curr[k]
                    } else {
                        if (typeof (curr[k]) != 'object') {
                            curr[k] = {}
                            curr = curr[k]
                        } else {
                            curr = curr[k]
                        }
                    }
                }
            }
        }
        let kv = items[items.length - 1].match(/^(.*?)(\[-?\d+\])?$/)
        if (!kv) { return }
        let k = kv[1]
        if (kv[2]) {
            let i = parseInt(kv[2].slice(1, kv[2].length - 1))
            if (k in curr) {
                if (Array.isArray(curr[k])) {
                    let arr = curr[k]
                    if (isDelete) {
                        if (arr.length == 0) { return }
                        // 支持负索引删除
                        let idx = ((i % arr.length) + arr.length) % arr.length;
                        arr.splice(idx, 1)
                    } else {
                        if (i < 0) {
                            arr.splice(-i - 1, 0, value)
                        } else if (i < arr.length) {
                            arr[i] = value
                        } else {
                            arr.push(value)
                        }
                    }
                } else {
                    if (isDelete) {
                        delete curr[k]
                    } else {
                        curr[k] = value
                    }
                }
            } else {
                if (!isDelete) {
                    curr[k] = [value]
                }
            }
        } else {
            if (isDelete) {
                delete curr[k]
            } else {
                curr[k] = value
            }
        }
    }

    get_obj_value(data: any, key: string): any {
        try {
            // key 直接在对象中
            if (data[key]) {
                return data[key]
            }

            let keys = key.split('.')
            let left = keys[0];
            let right = keys.slice(1).join('.');

            if (left) {
                // key[3],key[-3]
                let items = left.match(/^(.*?)(\[-?\d+\])?$/)
                if (!items) { return null }
                if (items[1]) {
                    data = data[items[1]]
                }
                if (!data) { return null }
                if (items[2]) {
                    if (Array.isArray(data)) {
                        if (data.length == 0) {
                            data = null;
                        } else {
                            let i = parseInt(items[2].slice(1, items[2].length - 1))
                            i = ((i % data.length) + data.length) % data.length;
                            data = data[i]
                        }
                    } else if (typeof data == 'object') {
                        let keys = Object.keys(data).sort();
                        if (keys.length == 0) {
                            data = null;
                        } else {
                            let i = parseInt(items[2].slice(1, items[2].length - 1))
                            i = ((i % keys.length) + keys.length) % keys.length;
                            data = data[keys[i]]
                        }
                    }
                }
            }
            if (!right) {
                return data;
            } else {
                return this.get_obj_value(data, right);
            }
        } catch (error) {
            return null;
        }
    }

    // LINE 存在时在其之后插件，不存在在末尾
    async insert_after_line(tfile: TFile, aline: string, LINE: string, tail = true, suffix = '\n\n') {
        if (!tfile) { return false }
        let ctx = await this.ea.app.vault.cachedRead(tfile)

        let idx = ctx.indexOf(LINE)

        if (idx == -1 && tail) {
            ctx = `${ctx}${suffix}${aline}`
        } else {
            ctx = `${ctx.slice(0, idx + LINE.length)}\n${aline}${ctx.slice(idx + LINE.length)}`
        }
        await this.ea.app.vault.modify(tfile, ctx)
        return true;
    }


}

