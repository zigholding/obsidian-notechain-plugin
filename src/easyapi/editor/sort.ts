import { App } from 'obsidian';
import type { EasyAPI } from '../easyapi';
import type { EasyEditor } from '../editor';

type SortField<T> = ((item: T) => unknown) | (keyof T & string) | string;

/** 自然排序：字母块与数字块交替比较，数字按数值。 */
function naturalCompare(a: string, b: string): number {
	const split = (s: string) => s.match(/([a-zA-Z]+|\d+)/g) ?? [];
	const partsA = split(a);
	const partsB = split(b);
	const minLen = Math.min(partsA.length, partsB.length);

	for (let i = 0; i < minLen; i++) {
		const partA = partsA[i];
		const partB = partsB[i];
		const isNumA = /^\d+$/.test(partA);
		const isNumB = /^\d+$/.test(partB);

		if (isNumA && isNumB) {
			const numA = parseInt(partA, 10);
			const numB = parseInt(partB, 10);
			if (numA !== numB) { return numA - numB; }
		} else if (!isNumA && !isNumB) {
			const cmp = partA.localeCompare(partB);
			if (cmp !== 0) { return cmp; }
		} else {
			return isNumA ? -1 : 1;
		}
	}
	return partsA.length - partsB.length;
}

/** 提取字符串中的第一个整数；没有则返回 null。 */
function extractFirstNumber(str: string): number | null {
	const match = str.match(/\d+/);
	return match ? parseInt(match[0], 10) : null;
}

function readField<T extends object>(item: T, field: SortField<T>): unknown {
	if (typeof field === 'function') {
		return field(item);
	}
	return (item as Record<string, unknown>)[field];
}

export class EasyEditorSort {
	app!: App;
	ea!: EasyAPI;
	nretry!: number;

	/**
	 * 按一个或多个字段排序，返回新数组。
	 * 字段可以是属性名，也可以是取值函数。
	 * `extractNumber` 为 false 时用自然排序；为 true 时按字段里的第一个整数排，没有数字的排在后面。
	 */
	sortObjectsByField<T extends object>(
		this: EasyEditor,
		objects: readonly T[],
		fields: SortField<T> | SortField<T>[],
		extractNumber = false,
	): T[] {
		const fieldList = Array.isArray(fields) ? fields : [fields];
		const arr = [...objects];

		return arr.sort((a, b) => {
			for (const field of fieldList) {
				const valA = readField(a, field);
				const valB = readField(b, field);
				const rawA = valA ?? '';
				const rawB = valB ?? '';
				const strA = String(rawA);
				const strB = String(rawB);

				let compareResult = 0;

				if (extractNumber) {
					const numA = typeof rawA === 'number' ? rawA : extractFirstNumber(strA);
					const numB = typeof rawB === 'number' ? rawB : extractFirstNumber(strB);

					if (numA !== null && numB !== null) {
						if (numA !== numB) {
							compareResult = numA - numB;
						} else {
							compareResult = strA.localeCompare(strB);
						}
					} else if (numA !== null) {
						compareResult = -1;
					} else if (numB !== null) {
						compareResult = 1;
					} else {
						compareResult = strA.localeCompare(strB);
					}
				} else {
					compareResult = naturalCompare(strA, strB);
				}

				if (compareResult !== 0) {
					return compareResult;
				}
			}
			return 0;
		});
	}
}
