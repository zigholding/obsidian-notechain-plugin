import { App, Platform, getLanguage } from 'obsidian';

import {
	desktopNode,
	isMobileApp,
	vaultBasePath,
	type NodeFsModule,
	type NodePathModule,
} from '../../obsidian-app';
import { dialog_suggest } from './inputSuggester';

export interface FileDialogFilter {
	name: string;
	extensions: string[];
}

export type OpenDialogProperty =
	| 'openFile'
	| 'openDirectory'
	| 'multiSelections'
	| 'showHiddenFiles'
	| 'createDirectory'
	| 'promptToCreate'
	| 'noResolveAliases'
	| 'treatPackageAsDirectory'
	| 'dontAddToRecent';

export type SaveDialogProperty =
	| 'showHiddenFiles'
	| 'createDirectory'
	| 'treatPackageAsDirectory'
	| 'showOverwriteConfirmation'
	| 'dontAddToRecent';

export interface OpenFileDialogOptions {
	title?: string;
	defaultPath?: string;
	buttonLabel?: string;
	filters?: FileDialogFilter[];
	message?: string;
	/** Select multiple files. Also implied by `properties` containing `multiSelections`. */
	multi?: boolean;
	/**
	 * `true`：只选文件夹。
	 * `'both'`：文件或文件夹都可选。macOS 用系统对话框；Windows / Linux 会先问类型再打开对应系统对话框。
	 * 也可在 `properties` 里同时写 `'openFile'` 与 `'openDirectory'`。
	 */
	directory?: boolean | 'both';
	properties?: OpenDialogProperty[];
}

export interface SaveFileDialogOptions {
	title?: string;
	defaultPath?: string;
	buttonLabel?: string;
	filters?: FileDialogFilter[];
	message?: string;
	properties?: SaveDialogProperty[];
}

interface ElectronRemoteDialog {
	showOpenDialog?: (...args: unknown[]) => Promise<{
		canceled?: boolean;
		filePaths?: string[];
	}>;
	showSaveDialog?: (...args: unknown[]) => Promise<{
		canceled?: boolean;
		filePath?: string;
	}>;
}

interface ElectronRemoteApi {
	dialog?: ElectronRemoteDialog;
	getCurrentWindow?: () => unknown;
}

function electronRemote(): ElectronRemoteApi | undefined {
	const electron = desktopNode<{
		remote?: ElectronRemoteApi;
		dialog?: ElectronRemoteDialog;
	}>('electron');
	if (electron?.remote) return electron.remote;
	if (electron?.dialog) return { dialog: electron.dialog };
	return undefined;
}

async function nativeOpenDialog(opts: Record<string, unknown>) {
	const remote = electronRemote();
	const show = remote?.dialog?.showOpenDialog;
	if (typeof show !== 'function') return undefined;
	const win = remote?.getCurrentWindow?.();
	return win ? await show(win, opts) : await show(opts);
}

async function nativeSaveDialog(opts: Record<string, unknown>) {
	const remote = electronRemote();
	const show = remote?.dialog?.showSaveDialog;
	if (typeof show !== 'function') return undefined;
	const win = remote?.getCurrentWindow?.();
	return win ? await show(win, opts) : await show(opts);
}

function isAbsFilePath(p: string): boolean {
	if (/^[a-zA-Z]:[\\/]/.test(p)) return true;
	if (p.startsWith('\\\\')) return true;
	if (p.startsWith('/') && !Platform.isWin) return true;
	return false;
}

function toNativeSeparators(p: string, sep: string): string {
	return sep === '\\' ? p.replace(/\//g, '\\') : p.replace(/\\/g, '/');
}

function pathExists(fs: NodeFsModule | undefined, p: string): boolean {
	if (!fs) return false;
	try {
		return fs.existsSync(p);
	} catch {
		return false;
	}
}

function pathIsDir(fs: NodeFsModule | undefined, p: string): boolean {
	if (!fs || !pathExists(fs, p)) return false;
	try {
		return fs.statSync(p).isDirectory();
	} catch {
		return false;
	}
}

function existingAncestor(fs: NodeFsModule, pathMod: NodePathModule, p: string): string | undefined {
	let cur = p;
	for (let i = 0; i < 64; i++) {
		if (pathExists(fs, cur)) return cur;
		const parent = pathMod.dirname(cur);
		if (!parent || parent === cur) return undefined;
		cur = parent;
	}
	return undefined;
}

/**
 * Electron/Windows ignore relative `defaultPath` (cwd is not the vault)
 * and treat `C:\\folder` without a trailing sep as a filename.
 */
function resolveDefaultPath(
	app: App,
	defaultPath: string | undefined,
	kind: 'open-file' | 'open-directory' | 'save',
): string | undefined {
	const raw = defaultPath?.trim();
	if (!raw) return undefined;

	const pathMod = desktopNode<NodePathModule>('path');
	const fsMod = desktopNode<NodeFsModule>('fs');
	const sep = pathMod?.sep ?? (Platform.isWin ? '\\' : '/');
	const vaultRoot = vaultBasePath(app);

	let p = raw
		.replace(/\$\{ROOT\}/g, vaultRoot)
		.replace(/\$\{VAULT\}/g, app.vault.getName());
	if (/^file:\/\/\//i.test(p)) {
		p = decodeURIComponent(p.slice('file:///'.length));
		if (!/^[a-zA-Z]:/.test(p) && !p.startsWith('/')) p = '/' + p;
	}

	if (!isAbsFilePath(p)) {
		p = pathMod ? pathMod.join(vaultRoot, p) : `${vaultRoot.replace(/[\\/]+$/, '')}${sep}${p.replace(/^[\\/]+/, '')}`;
	}
	p = toNativeSeparators(p, sep);

	if (fsMod && pathMod) {
		if (kind === 'save') {
			const base = pathMod.basename(p);
			const hit = existingAncestor(fsMod, pathMod, pathMod.dirname(p)) ?? existingAncestor(fsMod, pathMod, p);
			if (hit) {
				const dir = pathIsDir(fsMod, hit) ? hit : pathMod.dirname(hit);
				p = pathMod.join(dir, base);
			}
		} else if (!pathExists(fsMod, p)) {
			const hit = existingAncestor(fsMod, pathMod, p);
			if (hit) p = hit;
		}
	}

	const asDir = kind === 'open-directory' || (kind !== 'save' && pathIsDir(fsMod, p));
	if (asDir) {
		p = p.replace(/[\\/]+$/, '');
		if (!p.endsWith(sep)) p += sep;
	}
	return p;
}

function resolveOpenProperties(options: OpenFileDialogOptions): OpenDialogProperty[] {
	const properties: OpenDialogProperty[] = [...(options.properties ?? [])];
	const both = options.directory === 'both';
	const dirOnly = options.directory === true;
	if (both) {
		if (!properties.includes('openFile')) properties.push('openFile');
		if (!properties.includes('openDirectory')) properties.push('openDirectory');
	} else if (dirOnly) {
		if (!properties.includes('openDirectory')) properties.push('openDirectory');
	} else if (!properties.includes('openFile') && !properties.includes('openDirectory')) {
		properties.push('openFile');
	}
	if (options.multi && !properties.includes('multiSelections')) {
		properties.push('multiSelections');
	}
	return properties;
}

function wantsFileAndDirectory(properties: OpenDialogProperty[]): boolean {
	return properties.includes('openFile') && properties.includes('openDirectory');
}

/** Windows / Linux native dialog cannot be both a file and a folder picker. */
async function splitBothOnNonMac(
	host: { app: App },
	options: OpenFileDialogOptions,
	properties: OpenDialogProperty[],
): Promise<OpenDialogProperty[] | null> {
	if (!wantsFileAndDirectory(properties) || Platform.isMacOS) return properties;
	const zh = getLanguage() === 'zh';
	const mode = await dialog_suggest.call(
		host,
		zh ? ['文件', '文件夹'] : ['File', 'Folder'],
		['file', 'dir'] as const,
		options.title || (zh ? '选择文件或文件夹' : 'Select file or folder'),
	);
	if (mode !== 'file' && mode !== 'dir') return null;
	const next: OpenDialogProperty[] = properties.filter(
		(p) => p !== 'openFile' && p !== 'openDirectory',
	);
	next.push(mode === 'dir' ? 'openDirectory' : 'openFile');
	return next;
}

/**
 * Native OS open-file dialog (desktop only).
 * Single select returns one path; `multi: true` returns a path list.
 */
export async function showOpenDialog(
	this: { app: App },
	options: OpenFileDialogOptions & { multi: true },
): Promise<string[] | null>;
export async function showOpenDialog(
	this: { app: App },
	options?: OpenFileDialogOptions,
): Promise<string | null>;
export async function showOpenDialog(
	this: { app: App },
	options: OpenFileDialogOptions = {},
): Promise<string | string[] | null> {
	if (isMobileApp(this.app)) return null;
	if (typeof electronRemote()?.dialog?.showOpenDialog !== 'function') return null;
	try {
		const properties = await splitBothOnNonMac(this, options, resolveOpenProperties(options));
		if (!properties) return null;
		const kind = properties.includes('openDirectory') && !properties.includes('openFile')
			? 'open-directory'
			: 'open-file';
		const opts: Record<string, unknown> = { properties };
		if (options.title) opts.title = options.title;
		const defaultPath = resolveDefaultPath(this.app, options.defaultPath, kind);
		if (defaultPath) opts.defaultPath = defaultPath;
		if (options.buttonLabel) opts.buttonLabel = options.buttonLabel;
		if (options.filters?.length) opts.filters = options.filters;
		if (options.message) opts.message = options.message;
		const result = await nativeOpenDialog(opts);
		if (result?.canceled || !result?.filePaths?.length) return null;
		const multi = options.multi === true || properties.includes('multiSelections');
		return multi ? result.filePaths : result.filePaths[0];
	} catch {
		return null;
	}
}

/**
 * Native OS save-file dialog (desktop only).
 * @returns selected absolute path, or `null` if cancelled / unavailable / mobile
 */
export async function showSaveDialog(
	this: { app: App },
	options: SaveFileDialogOptions = {},
): Promise<string | null> {
	if (isMobileApp(this.app)) return null;
	if (typeof electronRemote()?.dialog?.showSaveDialog !== 'function') return null;
	try {
		const opts: Record<string, unknown> = {};
		if (options.title) opts.title = options.title;
		const defaultPath = resolveDefaultPath(this.app, options.defaultPath, 'save');
		if (defaultPath) opts.defaultPath = defaultPath;
		if (options.buttonLabel) opts.buttonLabel = options.buttonLabel;
		if (options.filters?.length) opts.filters = options.filters;
		if (options.message) opts.message = options.message;
		if (options.properties?.length) opts.properties = options.properties;
		const result = await nativeSaveDialog(opts);
		if (result?.canceled || !result?.filePath) return null;
		return result.filePath;
	} catch {
		return null;
	}
}
