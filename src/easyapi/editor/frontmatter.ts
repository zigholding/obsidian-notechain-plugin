import { App, TAbstractFile, TFile, TFolder } from 'obsidian';
import type { EasyAPI } from '../easyapi';

export class EasyEditorFrontmatter {
	/** Host EasyEditor fields/methods (filled by applyMixins). */
	[key: string]: any;

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

            const off = this.app.metadataCache.on('changed', (file: any) => {
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
            await this.app.fileManager.processFrontMatter(tfile, (fm: any) => {
                for (const k in kv) {
                    this.set_obj_value(fm, k, kv[k]);
                }
            });

            const ok = await this.wait_frontmatter(tfile, kv, 1000);
            if (ok) return true;
        }

        return false;
    }

    get_frontmatter(tfile: TAbstractFile|string, key: string, default_value: any = null): any {
        try {
            if (!tfile) { return default_value; }
            if (typeof tfile === 'string') {
                tfile = this.ea.file.get_tfile(tfile) as TFile;
            }
            if (tfile instanceof TFile) {
                const meta = this.app.metadataCache.getFileCache(tfile);
                if (meta?.frontmatter) {
                    if (Object.prototype.hasOwnProperty.call(meta.frontmatter, key)) {
                        return meta.frontmatter[key] ?? default_value;
                    }
                    const keys = key.split('.');
                    let cfm: any = meta.frontmatter;
                    for (const k of keys) {
                        const items = k.match(/^(.*?)(\[-?\d+\])?$/);
                        if (!items) { return default_value; }
                        if (items[1]) {
                            cfm = cfm[items[1]];
                        }
                        if (cfm == null) { return default_value; }
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
                // If the file has no frontmatter (or cache hasn't loaded yet),
                // keep behavior consistent and return the provided default.
                return default_value;
            }else if (tfile instanceof TFolder) {
                let sfile = this.ea.file.get_tfile(tfile.path+'/'+tfile.name+'.md');
                return this.get_frontmatter(sfile,key,default_value)
            }
            return default_value;
        } catch {
            return default_value;
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

    async set_frontmatter_align_file(src: TFile, dst: TFile, field: string) {
        if (field) {
            const value = this.get_frontmatter(src, field);
            if (value) {
                await this.set_frontmatter(dst, field, value, 1);
            }
        }
    }

}
