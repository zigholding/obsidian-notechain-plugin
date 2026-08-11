import { TFile } from 'obsidian';
import type { EasyAPI } from '../easyapi';
import {
	codeFenceStartsWithLanguage,
	fencedCodeInnerContent,
	fencedCodeInnerLoose,
} from './codeFence';

export class EasyEditorBlocks {
	/** Host EasyEditor fields/methods (filled by applyMixins). */
	[key: string]: any;

    private strip_blockquote_prefix(line: string): string {
        return line.replace(/^(?:>[ \t]*)+/, '');
    }

    /**
     * Walk markdown lines and collect fenced blocks whose info string matches `fenceInfo`.
     * Supports fences nested in `>` quotes / callouts (each line may be prefixed with `>`).
     */
    private scan_fenced_blocks(
        content: string,
        fenceInfo: string,
        marks: string[] = ['```', '~~~'],
    ): { inner: string; start: number; end: number }[] {
        const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const lines = content.split(/\r?\n/);
        const found: { inner: string; start: number; end: number }[] = [];
        let i = 0;
        while (i < lines.length) {
            let hit = false;
            for (const mark of marks) {
                const openRe = new RegExp(
                    `^(?:>[ \\t]*)*${escapeRegExp(mark)}${fenceInfo}[ \\t]*$`
                );
                if (!openRe.test(lines[i])) {
                    continue;
                }
                const closeRe = new RegExp(`^(?:>[ \\t]*)*${escapeRegExp(mark)}[ \\t]*$`);
                const body: string[] = [];
                const start = i;
                i++;
                while (i < lines.length && !closeRe.test(lines[i])) {
                    body.push(this.strip_blockquote_prefix(lines[i]));
                    i++;
                }
                if (i < lines.length) {
                    found.push({
                        inner: body.join('\n').trim(),
                        start,
                        end: i,
                    });
                    i++;
                }
                hit = true;
                break;
            }
            if (!hit) {
                i++;
            }
        }
        return found;
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

        return this.scan_fenced_blocks(tfile, fenceInfo).map(b => b.inner);
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
            await this.app.vault.process(tfile, (data: string) => {
                if (data.indexOf(regex) > -1) {
                    return data.replace(regex, target);
                }
                return data;
            });
        } else if (regex instanceof RegExp) {
            await this.app.vault.process(tfile, (data: string) => {
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

    async expand_wiki_embeds_in_string(
        content: string,
        maxDepth: number,
        expanding: Set<string>,
    ): Promise<string> {
        if (maxDepth <= 0) {
            return content;
        }
        const re = /!\[\[([^\]]+)\]\]/g;
        const parts: string[] = [];
        let lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(content)) !== null) {
            parts.push(content.slice(lastIndex, m.index));
            lastIndex = re.lastIndex;
            const full = m[0];
            const dest = this.ea.file.get_tfile(full);
            if (!dest || !(dest instanceof TFile) || dest.extension !== 'md') {
                parts.push(full);
                continue;
            }
            if (expanding.has(dest.path)) {
                parts.push(full);
                continue;
            }
            expanding.add(dest.path);
            const raw = await this.ea.file.read_tfile(full);
            if (raw === full) {
                expanding.delete(dest.path);
                parts.push(full);
                continue;
            }
            let body = await this.remove_metadata(raw);
            body = await this.expand_wiki_embeds_in_string(body, maxDepth - 1, expanding);
            expanding.delete(dest.path);
            parts.push(body);
        }
        parts.push(content.slice(lastIndex));
        return parts.join('');
    }

    

    /** Inline ```js //templater``` (and sibling info strings) → `<%* … -%>`, matching {@link extract_templater_block} so full-text `parse_commands` runs fenced tpl. Also handles fences inside `>` quotes / callouts. */
    expand_fenced_templater_in_full_text(content: string): string {
        const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const types = ['js //templater', 'js templater', 'js tpl', 'js //tpl'];
        const fenceInfo = `(?:${types.map(escapeRegExp).join('|')})`;
        const lines = content.split(/\r?\n/);
        const blocks = this.scan_fenced_blocks(content, fenceInfo);
        if (blocks.length === 0) {
            return content;
        }
        const out: string[] = [];
        let i = 0;
        for (const b of blocks) {
            while (i < b.start) {
                out.push(lines[i]);
                i++;
            }
            out.push(`<%*\n${b.inner}\n-%>`);
            i = b.end + 1;
        }
        while (i < lines.length) {
            out.push(lines[i]);
            i++;
        }
        return out.join('\n');
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

}
