import type { EasyAPI } from '../easyapi';

export class EasyEditorObjPath {
	/** Host EasyEditor fields/methods (filled by applyMixins). */
	[key: string]: any;

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

}
