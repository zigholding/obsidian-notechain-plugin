import {
	TAbstractFile,
	TFile, TFolder
} from 'obsidian';

import { LexoRank } from 'lexorank';

export class NoteChainLexorank {
	/** Host NoteChain fields/methods (filled by applyMixins). */
	[key: string]: any;


	lexorank_init_keys(N: number): string[] {
		if (N <= 0) return [];
	
		let min = LexoRank.min();
		let max = LexoRank.max();
	
		let result: string[] = [];
	
		function divide(left: LexoRank, right: LexoRank, n: number) {
			if (n <= 0) return;
	
			// 取中点
			let mid = left.between(right);
			result.push(mid.toString());
	
			// 平均分配左右区间
			let leftCount = Math.floor((n - 1) / 2);
			let rightCount = (n - 1) - leftCount;
	
			divide(left, mid, leftCount);
			divide(mid, right, rightCount);
		}
	
		divide(min, max, N);
		return result.sort(); // 保证顺序
	}

	lexorank_gen_mid(prev: string, next: string) {
		if (!prev && !next) { return undefined }

		if (!prev) {
			return this.LexoRank.parse(next).genPrev().toString()
		}

		if (!next) {
			return this.LexoRank.parse(prev).genNext().toString()
		}

		let p = this.LexoRank.parse(prev);
		let n = this.LexoRank.parse(next);
		return p.between(n).toString();

	}

	async lexorank_set_id(tfile: TAbstractFile, key: string | undefined) {
		if (!key) { return false }
		let ckey = await this.lexorank_get_id(tfile);
		if (ckey == key) { return false }
		if (tfile instanceof TFolder) {
			let xfile = await this.get_folder_note(tfile, true);
			console.log(`set ${xfile.basename} ${this.fid} as ${key}`)
			await this.plugin.editor.set_frontmatter(xfile, this.fid, key)
		} else if (tfile instanceof TFile) {
			if (!this.plugin.wordcount.filter(tfile)) { return }
			console.log(`set ${tfile.basename} ${this.nid} as ${key}`)
			await this.plugin.editor.set_frontmatter(tfile, this.nid, key);
		}
		return true;
	}

	async lexorank_get_id(tfile: TAbstractFile) {
		if (tfile instanceof TFolder) {
			let xfile = await this.get_folder_note(tfile, false);
			if (xfile) {
				return this.plugin.editor.get_frontmatter(xfile, this.fid)
			} else {
				return undefined;
			}
		} else if (tfile instanceof TFile) {
			if (this.plugin.wordcount.filter(tfile)) {
				return this.plugin.editor.get_frontmatter(tfile, this.nid);
			}
		}
	}

	async lexorank_init_folder(tfolder: TFolder, recursive = false) {
		let tfiles = this.children[tfolder.path];
		if (tfiles) {
			tfiles = tfiles.filter((tfile: TAbstractFile) => {
				return tfile instanceof TFolder || (
					tfile instanceof TFile && tfile.extension == 'md'
				)
			})
			let keys = this.lexorank_init_keys(tfiles.length);
			let i = 0;
			while (i < tfiles.length) {
				await this.lexorank_set_id(tfiles[i], keys[i]);
				i = i + 1;
			}
		}
		if (!recursive) { return }
		for (let tfile of tfiles) {
			if (tfile instanceof TFolder) {
				await this.lexorank_init_folder(tfile, recursive);
			}
		}
	}

	lexorank_gen_keys(keys:(string|undefined)[]):(string|undefined)[]{
		// 2️⃣ 遍历
		let i = 0;
		while (i < keys.length) {
			if (!keys[i]) {
				// 🔹缺失 key -> 找前后边界
				let prevKey: string | null = null;
				for (let j = i - 1; j >= 0; j--) {
					if (keys[j]) {
						prevKey = keys[j]!;
						break;
					}
				}

				let nextKey: string | null = null;
				for (let j = i + 1; j < keys.length; j++) {
					if (keys[j]) {
						nextKey = keys[j]!;
						break;
					}
				}

				let prevRank: LexoRank | null = prevKey ? this.LexoRank.parse(prevKey) : null;
				let nextRank: LexoRank | null = nextKey ? this.LexoRank.parse(nextKey) : null;

				let newRank: LexoRank;
				if (prevRank && nextRank) {
					if (prevRank.toString() === nextRank.toString()) {
						// 🔹相等：没空间，顺延
						newRank = prevRank.genNext();
					} else {
						newRank = prevRank.between(nextRank);
					}
				} else if (prevRank) {
					newRank = prevRank.genNext();
				} else if (nextRank) {
					newRank = nextRank.genPrev();
				} else {
					newRank = this.LexoRank.middle();
				}

				keys[i] = newRank.toString();
				i++;
				continue;
			}

			// 🔹检测冲突（非递增）
			if (i > 0 && keys[i - 1]! >= keys[i]!) {
				let start = i - 1;
				let end = i;
				while (end + 1 < keys.length && keys[end]! >= keys[end + 1]!) end++;

				// 前后边界
				let leftKey: string | null = start > 0 ? keys[start - 1] || null : null;
				let rightKey: string | null = end + 1 < keys.length ? keys[end + 1] || null : null;

				let lastRank: LexoRank | null = leftKey ? this.LexoRank.parse(leftKey) : null;

				// 🔹批量生成冲突区间 key
				for (let k = start; k <= end; k++) {
					let nextRank: LexoRank | null = rightKey ? this.LexoRank.parse(rightKey) : null;
					let newRank: LexoRank;

					if (lastRank && nextRank) {
						if (lastRank.toString() === nextRank.toString()) {
							// 🔹相等：没空间，顺延
							newRank = lastRank.genNext();
						} else {
							newRank = lastRank.between(nextRank);
						}
					} else if (lastRank) {
						newRank = lastRank.genNext();
					} else if (nextRank) {
						newRank = nextRank.genPrev();
					} else {
						newRank = this.LexoRank.middle();
					}

					keys[k] = newRank.toString();
					lastRank = this.LexoRank.parse(keys[k]);
				}

				i = end + 1;
				continue;
			}

			i++;
		}
		return keys;
	}

	
	lexorank_check_keys(keys:(string|undefined)[]){
		let i = 0;
		while(i<keys.length-1){
			let curr = keys[i];
			let next = keys[i+1];
			if(!curr || !next){
				return false;
			}
			if(next <= curr){
				return false;
			}
			i = i +1;
		}
		return true;
	}

	async lexorank_get_ids(tfiles:TAbstractFile[]){
		let keys: (string | undefined)[] = [];
		for (let i = 0; i < tfiles.length; i++) {
			let k = await this.lexorank_get_id(tfiles[i]);
			keys.push(k);
		}
		return keys;
	}

	async lexorank_set_ids(tfiles:TAbstractFile[],keys:(string|undefined)[]){
		let p: Promise<any>[] = [];
		let i = 0;
		while (i < tfiles.length) {
			if (
				tfiles[i] instanceof TFolder ||
				(tfiles[i] instanceof TFile && (tfiles[i] as TFile).basename == tfiles[i].parent?.name)
			) {
				p.push(this.lexorank_set_id(tfiles[i], keys[i]));
			} else {
				p.push(this.lexorank_set_id(tfiles[i], keys[i]));
			}
			i++;
		}

		const results = await Promise.all(p);
		return results;
	}

	async lexorank_reset_tfiles(tfiles: TAbstractFile[],rebuild=false) {
		// 仅保留文件夹和 md 文件
		tfiles = tfiles.filter(
			(f: TAbstractFile) => f instanceof TFolder || (f instanceof TFile && f.extension === "md")
		);
		let keys;
		if(rebuild){
			keys = this.lexorank_init_keys(tfiles.length);
		}else{
			keys = await this.lexorank_get_ids(tfiles);
			let  i = 0;
			while(!this.lexorank_check_keys(keys)){
				keys = this.lexorank_gen_keys(keys);
				i = i+1;
				if(i>5){
					break;
				}
			}
		}
		let p = await this.lexorank_set_ids(tfiles,keys);
		return p;
	}


	async lexorank_reset_folder(tfolder: TFolder, recursive = false) {
		let tfiles = this.children[tfolder.path];
		if (!tfiles) return;

		await this.lexorank_reset_tfiles(tfiles);

		// 3️⃣ 递归处理子文件夹
		if (recursive) {
			for (let f of tfiles) {
				if (f instanceof TFolder) {
					await this.lexorank_reset_folder(f, recursive);
				}
			}
		}
		console.log(`Lexorank reset folder: ${tfolder.path} ✔️`)
	}

	async lexorank_reset_vault(root = '/',rebuild=false) {
		let i = 10;
		let res;
		while(i!=0){
			let tfiles = this.children_as_chain(root);
			res = await this.lexorank_reset_tfiles(tfiles,rebuild);
			if(res.filter(x=>x).length==0){
				break
			}
			i = i -1
		}
		console.log(`Lexorank reset vault: ${root} ✔️`)
		return res?.filter(x=>x).length;
	}

}
