import { App, MarkdownView, Platform, Plugin, TAbstractFile, TFile, TFolder, View } from 'obsidian';

import type NoteChainPlugin from './plugin';

export interface ObsidianCommand {
	id: string;
	name: string;
}

export interface ObsidianPlugins {
	plugins: Record<string, Plugin | undefined>;
	getPlugin(id: string): Plugin | null;
}

export interface ObsidianCommands {
	executeCommandById(id: string): boolean | Promise<boolean>;
	findCommand?(id: string): ObsidianCommand | undefined | null;
	commands: Record<string, ObsidianCommand>;
}

export interface ObsidianInternalPlugins {
	getEnabledPluginById(id: string): unknown;
}

/** Undocumented App fields used throughout the plugin. */
export interface ObsidianApp extends App {
	plugins: ObsidianPlugins;
	commands: ObsidianCommands;
	internalPlugins: ObsidianInternalPlugins;
	isMobile: boolean;
	appId?: string;
}

export function obsidianApp(app: App): ObsidianApp {
	return app as ObsidianApp;
}

export function noteChainPlugin(app: App): NoteChainPlugin | undefined {
	const api = obsidianApp(app).plugins;
	const p = api?.getPlugin?.('note-chain') ?? api?.plugins?.['note-chain'];
	return p as NoteChainPlugin | undefined;
}

export function isMobileApp(app: App): boolean {
	return Platform.isMobile || obsidianApp(app).isMobile === true;
}

export interface VaultAdapterPaths {
	basePath?: string;
	getBasePath?: () => string;
	getFullPath?: (normalizedPath: string) => string;
	fs?: NodeFsModule;
	path?: NodePathModule;
}

export function vaultAdapter(app: App): VaultAdapterPaths {
	return app.vault.adapter as VaultAdapterPaths;
}

export function vaultBasePath(app: App): string {
	const a = vaultAdapter(app);
	if (typeof a.getBasePath === 'function') return a.getBasePath();
	return a.basePath ?? '';
}

export function vaultFullPath(app: App, normalizedPath: string): string {
	const a = vaultAdapter(app);
	if (typeof a.getFullPath === 'function') return a.getFullPath(normalizedPath);
	return normalizedPath;
}

export function activeFileView(app: App): MarkdownView | undefined {
	const ws = app.workspace as App['workspace'] & {
		getActiveFileView?: () => MarkdownView | undefined;
	};
	return ws.getActiveFileView?.();
}

export interface UniqueFileLookup {
	get(key: string): TFile[] | undefined;
}

export function uniqueFileLookup(app: App): UniqueFileLookup | undefined {
	return (app.metadataCache as App['metadataCache'] & {
		uniqueFileLookup?: UniqueFileLookup;
	}).uniqueFileLookup;
}

export interface BacklinksForFile {
	data: Iterable<[string, unknown]>;
}

export function getBacklinksForFile(app: App, file: TFile): BacklinksForFile | undefined {
	const cache = app.metadataCache as App['metadataCache'] & {
		getBacklinksForFile?: (file: TFile) => BacklinksForFile;
	};
	return cache.getBacklinksForFile?.(file);
}

export function vaultAllFolders(app: App): TFolder[] {
	const v = app.vault as App['vault'] & { getAllFolders?: () => TFolder[] };
	if (typeof v.getAllFolders === 'function') {
		return v.getAllFolders();
	}
	return app.vault.getAllLoadedFiles().filter((f): f is TFolder => f instanceof TFolder);
}

export interface VaultJsonIO {
	readJson?: (path: string) => Promise<unknown>;
	writeJson?: (path: string, data: unknown) => Promise<void>;
}

export function vaultJson(app: App): VaultJsonIO {
	return app.vault as App['vault'] & VaultJsonIO;
}

export interface VaultConfig {
	attachmentFolderPath?: string;
}

export function vaultConfig(app: App): VaultConfig | undefined {
	return (app.vault as App['vault'] & { config?: VaultConfig }).config;
}

export function vaultUserIgnoreFilters(app: App): string[] | undefined {
	return (app.vault as App['vault'] & { userIgnoreFilters?: string[] }).userIgnoreFilters;
}

/** Duck-typed Node path module (no static Node type imports). */
export interface NodePathModule {
	sep: string;
	join(...parts: string[]): string;
	basename(p: string, ext?: string): string;
	dirname(p: string): string;
	extname(p: string): string;
}

export interface NodeFsStats {
	size: number;
	mtimeMs: number;
	isFile(): boolean;
	isDirectory(): boolean;
}

export interface NodeReadStream {
	pipe(destination: unknown): unknown;
}

/** Duck-typed Node fs module (no static Node type imports). */
export interface NodeFsModule {
	existsSync(p: string): boolean;
	readFileSync(p: string, encoding: BufferEncoding): string;
	readFileSync(p: string): Buffer;
	writeFileSync(p: string, data: string | Uint8Array, encoding?: BufferEncoding): void;
	mkdirSync(p: string, opts?: { recursive?: boolean }): string | undefined;
	statSync(p: string): NodeFsStats;
	createReadStream(p: string, opts?: { start?: number; end?: number }): NodeReadStream;
	readdirSync(p: string): string[];
	unlinkSync(p: string): void;
	rmdirSync(p: string): void;
	copyFileSync(src: string, dest: string): void;
	promises?: {
		readFile(p: string): Promise<Buffer>;
	};
	readFile(
		p: string,
		encoding: BufferEncoding,
		cb: (err: Error | null, data: string) => void,
	): void;
	writeFile(
		p: string,
		data: string | Uint8Array,
		encoding: BufferEncoding,
		cb: (err: Error | null) => void,
	): void;
}

/** Duck-typed Node crypto module (no static Node type imports). */
export interface NodeHash {
	update(data: string | Uint8Array): NodeHash;
	digest(encoding: 'hex' | 'base64'): string;
}

export interface NodeCryptoModule {
	createHash(algorithm: string): NodeHash;
	randomBytes(size: number): Buffer;
	X509Certificate: new (pem: string) => { subjectAltName?: string };
}

/** Duck-typed Node TCP socket from HTTP upgrade (no static Node type imports). */
export interface NodeNetSocket {
	destroyed: boolean;
	destroy(): void;
	write(data: string | Uint8Array): boolean;
	end(): unknown;
	setTimeout(ms: number): unknown;
	setNoDelay(noDelay?: boolean): unknown;
	setKeepAlive(enable?: boolean): unknown;
	on(event: 'data', listener: (chunk: Buffer) => void): this;
	on(event: 'close' | 'error', listener: (err?: Error) => void): this;
	removeListener(event: 'data', listener: (chunk: Buffer) => void): this;
}

/** Duck-typed Node child_process (no static Node type imports). */
export interface NodeChildProcessModule {
	execSync(
		command: string,
		options?: {
			encoding?: BufferEncoding;
			stdio?: 'ignore' | ReadonlyArray<'pipe' | 'ignore' | 'inherit'>;
			windowsHide?: boolean;
			timeout?: number;
		},
	): string;
}

export function desktopRequire(): NodeRequire | undefined {
	if (typeof window !== 'undefined') {
		const req = (window as Window & { require?: NodeRequire }).require;
		if (typeof req === 'function') return req;
	}
	try {
		return require;
	} catch {
		return undefined;
	}
}

/** Lazy Node/Electron module load without a `require()` token (mobile-safe until called). */
export function desktopNode<T = unknown>(moduleId: string): T | undefined {
	const req = desktopRequire();
	if (typeof req !== 'function') return undefined;
	try {
		return req(moduleId) as T;
	} catch {
		return undefined;
	}
}

/** Same as desktopNode, but for desktop-only modules that must exist when used. */
export function desktopNodeOrThrow<T>(moduleId: string): T {
	const mod = desktopNode<T>(moduleId);
	if (mod === undefined) {
		throw new Error(`Node module "${moduleId}" is not available`);
	}
	return mod;
}

export function hasCommunityPlugin(app: App, id: string): boolean {
	return Object.prototype.hasOwnProperty.call(obsidianApp(app).plugins?.plugins ?? {}, id);
}

/** Undocumented file-explorer leaf view. */
export interface FileExplorerTreeItem {
	file: TAbstractFile;
	el: HTMLElement;
	innerEl: HTMLElement;
	vChildren?: {
		_children: FileExplorerTreeItem[];
		setChildren: (children: FileExplorerTreeItem[]) => void;
	};
}

export interface FileExplorerView {
	containerEl: HTMLElement;
	fileItems?: Record<string, FileExplorerTreeItem>;
	sortOrder?: string;
	ready?: boolean;
	tree?: {
		setCollapseAll: (collapse: boolean) => void;
		infinityScroll?: { compute: () => void };
	};
	revealInFolder?: (file: TAbstractFile) => void;
	sort?: () => void;
}

export function asFileExplorerView(view: unknown): FileExplorerView | undefined {
	if (!view || typeof view !== 'object') return undefined;
	return view as FileExplorerView;
}

export interface AppDragManager {
	app: App;
	hoverEl?: HTMLElement;
	ghostEl?: HTMLElement;
	sourceEls?: Array<{ dataset?: DOMStringMap }>;
}

export function appDragManager(app: App): AppDragManager | undefined {
	return (app as App & { dragManager?: AppDragManager }).dragManager;
}

export interface ElectronWebview {
	executeJavaScript(code: string): Promise<unknown>;
}

export interface WebviewerView extends View {
	webview?: ElectronWebview;
	url?: string;
}

export interface WebviewerInternalPlugin {
	openUrl(url: string, newLeaf?: boolean): void | Promise<void>;
}

export function asWebviewerView(view: unknown): WebviewerView | undefined {
	if (!view || typeof view !== 'object') return undefined;
	return view as WebviewerView;
}
