import type { EasyAPI } from '../easyapi';
import type { EasyEditor } from '../editor';
import { App } from 'obsidian';

export class EasyEditorListParse {
	app!: App;
	ea!: EasyAPI;
	nretry!: number;

    cn2num(this: EasyEditor, chinese: string): number {
        let v = parseFloat(chinese);
        if (!Number.isNaN(v)) { return v }

        if (chinese.startsWith('零') && chinese.length > 1) {
            return this.cn2num(chinese.slice(1));
        }

        chinese = chinese.trim()
        const cnNumbers: { [key: string]: number } = {
            "零": 0, "一": 1, "二": 2, "两": 2,"俩": 2, "三": 3, "四": 4,
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

    slice_by_position(
        this: EasyEditor,
        ctx: string,
        pos: { position?: { start: { offset: number }; end: { offset: number } }; start?: { offset: number }; end?: { offset: number } },
    ) {
        const range = pos.position ?? pos;
        const start = range.start?.offset;
        const end = range.end?.offset;
        if (typeof start !== 'number' || typeof end !== 'number') {
            return '';
        }
        return ctx.slice(start, end);
    }

    parse_list_regx(this: EasyEditor, aline: string, regx: RegExp, field: { [key: string]: number } = {}) {
        let match = aline.match(regx);
        if (!match) { return null }
        let res: { [key: string]: string } = { src: aline }
        for (let k in field) {
            res[k] = match[field[k]]
        }
        return res
    }

    parse_list_dataview(this: EasyEditor, aline: string, src = '_src_') {
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

    keys_in(this: EasyEditor, keys: Array<string>, obj: object) {
        for (let k of keys) {
            if (!(k in obj)) {
                return false
            }
        }
        return true;
    }

    range(this: EasyEditor, end: number = 0,start: number = 0): number[] {
        return Array.from({ length: end - start }, (_, index) => start + index);
    }
}
