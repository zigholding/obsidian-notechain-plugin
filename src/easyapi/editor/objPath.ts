import type { EasyAPI } from '../easyapi';
import type { EasyEditor } from '../editor';
import { App } from 'obsidian';
import { isRecord } from '../../ts-helpers';

export class EasyEditorObjPath {
	app!: App;
	ea!: EasyAPI;
	nretry!: number;

    set_obj_value(this: EasyEditor, data: Record<string, unknown>, key: string, value: unknown) {
        const isDelete = (value === '$DELETE');
        let items = key.trim().split('.')
        if (!items) { return }
        let curr: Record<string, unknown> = data
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
                    let arr = curr[k] as unknown[]
                    if (arr.length == 0) { return }
                    // 规范化索引
                    let idx = ((i % arr.length) + arr.length) % arr.length;
                            curr = arr[idx] as Record<string, unknown>
                } else {
                    if (!(k in curr)) { // 键不存在
                        curr[k] = [{}]
                        curr = (curr[k] as unknown[])[0] as Record<string, unknown>
                    } else {
                        if (Array.isArray(curr[k])) {
                            let arr = curr[k] as unknown[]
                            let tmp = {}
                            if (i < 0) {
                                arr.splice(-i - 1, 0, tmp)
                            } else if (i < arr.length) {
                                arr[i] = tmp
                            } else {
                                arr.push(tmp)
                            }
                            curr = tmp as Record<string, unknown>
                        } else {
                            curr[k] = [{}]
                            curr = (curr[k] as unknown[])[0] as Record<string, unknown>
                        }
                    }
                }
            } else {
                if (isDelete) {
                    // 删除模式下不创建中间对象
                    if (!(k in curr)) { return }
                    if (typeof (curr[k]) != 'object' || curr[k] === null) { return }
                    curr = curr[k] as Record<string, unknown>
                } else {
                    if (!(k in curr)) {
                        curr[k] = {}
                        curr = curr[k] as Record<string, unknown>
                    } else {
                        if (typeof (curr[k]) != 'object') {
                            curr[k] = {}
                            curr = curr[k] as Record<string, unknown>
                        } else {
                            curr = curr[k] as Record<string, unknown>
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
                    let arr = curr[k] as unknown[]
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

    get_obj_value(this: EasyEditor, data: unknown, key: string): unknown {
        try {
            // key 直接在对象中
            if (isRecord(data) && data[key] != null) {
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
                    if (!isRecord(data) && !Array.isArray(data)) { return null }
                    data = (data as Record<string, unknown>)[items[1]]
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
                    } else if (isRecord(data)) {
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

}
