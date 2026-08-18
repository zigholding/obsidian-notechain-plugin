import { App, Menu, Notice, Scope, TFile, setIcon } from "obsidian";

export type MediaKind = "image" | "video" | "audio";

export interface MediaLightboxMeta {
	/** 主标题（caption / name） */
	title?: string;
	/** 副标题行（如日历日期） */
	subtitle?: string;
	/** 多行正文（detail / day text） */
	detail?: string;
	/** 自定义计数；缺省为 "i / n" */
	counter?: string;
}

export interface MediaLightboxItemInfo {
	path: string | null;
	kind: MediaKind;
}

/** 传给 `#lightbox` 脚本笔记的 `tp.config.extra.media` */
export interface MediaLightboxScriptMedia<T = unknown> {
	path: string | null;
	kind: MediaKind;
	item: T;
	meta: MediaLightboxMeta;
	index: number;
	items: T[];
	/** 当前灯箱实例，脚本可调用 close / removeCurrent 等 */
	lightbox: MediaLightbox<T>;
}

export interface MediaLightboxOptions<T> {
	app: App;
	resolveUrl: (src: string) => Promise<string | null>;
	getItemInfo: (item: T) => MediaLightboxItemInfo;
	getMeta: (item: T, index: number, items: T[]) => MediaLightboxMeta;
	onContextAction?: (action: "delete" | "reveal", item: T) => void | Promise<void>;
	onClosed?: (item: T) => void;
	/** 左右切换是否循环；默认 false */
	wrapNavigation?: boolean;
	/**
	 * Esc 是否关闭 lightbox 并回到下层视图（默认 true）。
	 * 开启时会 push Keymap Scope，避免 Esc 直接关掉整个 Modal。
	 */
	closeOnEscape?: boolean;
	/** 滚轮切换防抖（ms）；默认 140 */
	wheelDebounceMs?: number;
	/**
	 * 右键菜单要加载的脚本笔记标签；默认 `lightbox`。
	 * 笔记需带该标签，执行时通过 `tp.config.extra.media` 取得当前媒体。
	 */
	scriptTag?: string;
}

function isZhUi(): boolean {
	return window.localStorage.getItem("language") === "zh";
}

/**
 * 通用媒体放大预览（图片 / 视频 / 音频），供卡片与日历复用。
 */
export class MediaLightbox<T> {
	private overlay!: HTMLElement;
	private stageEl!: HTMLElement;
	private imgEl!: HTMLImageElement;
	private videoEl!: HTMLVideoElement;
	private audioPanelEl!: HTMLElement;
	private audioEl!: HTMLAudioElement;
	private subtitleEl!: HTMLElement;
	private captionEl!: HTMLElement;
	private detailEl!: HTMLElement;
	private counterEl!: HTMLElement;
	private items: T[] = [];
	private index = 0;
	private session = 0;
	private isOpen = false;
	private wheelLock = false;
	private keyScope: Scope | null = null;
	private readonly wrapNavigation: boolean;
	private readonly closeOnEscape: boolean;
	private readonly wheelDebounceMs: number;

	constructor(private options: MediaLightboxOptions<T>) {
		this.wrapNavigation = options.wrapNavigation ?? false;
		this.closeOnEscape = options.closeOnEscape ?? true;
		this.wheelDebounceMs = options.wheelDebounceMs ?? 140;
		this.buildUI();
	}

	private buildUI(): void {
		this.overlay = document.body.createDiv({ cls: "nc-cal-lightbox" });
		this.overlay.hide();

		const backdrop = this.overlay.createDiv({ cls: "nc-cal-lightbox-backdrop" });
		backdrop.onclick = () => this.close();

		const frame = this.overlay.createDiv({ cls: "nc-cal-lightbox-frame" });

		const closeBtn = frame.createDiv({ cls: "nc-cal-lightbox-close nc-icon-btn", attr: { "aria-label": "Close" } });
		setIcon(closeBtn, "x");
		closeBtn.onclick = () => this.close();

		const prevBtn = frame.createDiv({ cls: "nc-cal-lightbox-nav nc-cal-lightbox-prev", attr: { "aria-label": "Previous" } });
		setIcon(prevBtn, "chevron-left");
		prevBtn.onclick = (e) => { e.stopPropagation(); this.go(-1); };

		this.stageEl = frame.createDiv({ cls: "nc-cal-lightbox-stage" });
		this.imgEl = this.stageEl.createEl("img", { cls: "nc-cal-lightbox-img" });
		this.imgEl.setAttr("draggable", "false");
		this.imgEl.onclick = (e) => e.stopPropagation();

		this.videoEl = this.stageEl.createEl("video", { cls: "nc-cal-lightbox-video" });
		this.videoEl.setAttr("controls", "true");
		this.videoEl.setAttr("playsinline", "true");
		this.videoEl.setAttr("preload", "metadata");
		this.videoEl.hide();
		this.videoEl.onclick = (e) => e.stopPropagation();

		this.audioPanelEl = this.stageEl.createDiv({ cls: "nc-cal-lightbox-audio-panel" });
		this.audioEl = this.audioPanelEl.createEl("audio", { cls: "nc-cal-lightbox-audio" });
		this.audioEl.setAttr("controls", "true");
		this.audioEl.setAttr("preload", "metadata");
		this.audioPanelEl.hide();

		const nextBtn = frame.createDiv({ cls: "nc-cal-lightbox-nav nc-cal-lightbox-next", attr: { "aria-label": "Next" } });
		setIcon(nextBtn, "chevron-right");
		nextBtn.onclick = (e) => { e.stopPropagation(); this.go(1); };

		const meta = frame.createDiv({ cls: "nc-cal-lightbox-meta" });
		this.subtitleEl = meta.createDiv({ cls: "nc-cal-lightbox-date" });
		this.captionEl = meta.createDiv({ cls: "nc-cal-lightbox-caption" });
		this.detailEl = meta.createDiv({ cls: "nc-cal-lightbox-text" });
		this.counterEl = meta.createDiv({ cls: "nc-cal-lightbox-counter" });

		frame.addEventListener("wheel", (e) => {
			e.preventDefault();
			if (this.wheelDebounceMs > 0) {
				if (this.wheelLock) return;
				this.wheelLock = true;
				this.go(e.deltaY > 0 ? 1 : -1);
				window.setTimeout(() => { this.wheelLock = false; }, this.wheelDebounceMs);
			} else {
				this.go(e.deltaY > 0 ? 1 : -1);
			}
		}, { passive: false });

		const onCtx = (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			this.showContextMenu(e);
		};
		this.overlay.addEventListener("contextmenu", onCtx);
		this.stageEl.addEventListener("contextmenu", onCtx);
		this.imgEl.addEventListener("contextmenu", onCtx);
		this.videoEl.addEventListener("contextmenu", onCtx);
		this.audioPanelEl.addEventListener("contextmenu", onCtx);
		meta.addEventListener("contextmenu", onCtx);
	}

	private showContextMenu(e: MouseEvent): void {
		const item = this.items[this.index];
		if (!item) return;

		const info = this.options.getItemInfo(item);
		const { kind, path } = info;
		const zh = isZhUi();
		const pathLabel = zh
			? (kind === "audio" ? "复制音频路径" : kind === "video" ? "复制视频路径" : "复制图片路径")
			: (kind === "audio" ? "Copy audio path" : kind === "video" ? "Copy video path" : "Copy image path");
		const copyImageLabel = zh ? "复制图片到剪贴板" : "Copy image to clipboard";
		const deleteLabel = zh
			? (kind === "audio" ? "删除音频" : kind === "video" ? "删除视频" : "删除图片")
			: (kind === "audio" ? "Delete audio" : kind === "video" ? "Delete video" : "Delete image");
		const revealLabel = zh
			? (kind === "audio" ? "在文件浏览器中打开音频位置" : kind === "video" ? "在文件浏览器中打开视频位置" : "在文件浏览器中打开图片位置")
			: "Show in system explorer";

		const menu = new Menu();
		if (path) {
			menu.addItem((menuItem) => {
				menuItem.setTitle(pathLabel)
					.setIcon("copy")
					.onClick(() => { void this.copyPathToClipboard(path); });
			});
		}
		if (kind === "image") {
			menu.addItem((menuItem) => {
				menuItem.setTitle(copyImageLabel)
					.setIcon("image")
					.onClick(() => { void this.copyImageToClipboard(path); });
			});
		}

		if (this.options.onContextAction) {
			if (path || kind === "image") menu.addSeparator();
			menu.addItem((menuItem) => {
				menuItem.setTitle(deleteLabel)
					.setIcon("trash")
					.onClick(() => { void this.options.onContextAction?.("delete", item); });
			});
			menu.addItem((menuItem) => {
				menuItem.setTitle(revealLabel)
					.setIcon("folder-open")
					.onClick(() => { void this.options.onContextAction?.("reveal", item); });
			});
		}

		const scripts = this.getLightboxScriptNotes();
		if (scripts.length) {
			menu.addSeparator();
			for (const script of scripts) {
				const title = this.getScriptMenuTitle(script);
				menu.addItem((menuItem) => {
					menuItem.setTitle(title)
						.setIcon("file-terminal")
						.onClick(() => { void this.runLightboxScript(script, item, info); });
				});
			}
		}

		menu.showAtPosition({ x: e.clientX, y: e.clientY });
		window.setTimeout(() => {
			document.querySelectorAll("body > .menu, .menu").forEach((el) => {
				(el as HTMLElement).style.setProperty("z-index", "100001", "important");
			});
		}, 0);
	}

	/** 查找 `#lightbox` 脚本笔记；手机端还需同时带 `#mobile` */
	private getLightboxScriptNotes(): TFile[] {
		const nc = (this.options.app as any).plugins?.plugins?.["note-chain"];
		const ea = nc?.easyapi ?? (window as any).ea;
		if (!ea?.file?.get_all_tfiles_tags) return [];

		const tag = (this.options.scriptTag ?? "lightbox").replace(/^#/, "");
		let files: TFile[] = ea.file.get_all_tfiles_tags(tag) ?? [];

		const isMobile = (this.options.app as any).isMobile === true;
		if (isMobile && ea.file.get_tags) {
			files = files.filter((f) => {
				const tags: string[] = ea.file.get_tags(f) ?? [];
				return tags.includes("#mobile") || tags.includes("mobile");
			});
		}

		if (nc?.chain?.sort_tfiles_by_chain) {
			files = nc.chain.sort_tfiles_by_chain(files);
		}
		return files;
	}

	private getScriptMenuTitle(tfile: TFile): string {
		const nc = (this.options.app as any).plugins?.plugins?.["note-chain"];
		const ea = nc?.easyapi ?? (window as any).ea;
		const title = ea?.editor?.get_frontmatter?.(tfile, "lightbox",'').trim();
		if (title) {
			return title;
		}
		const emoji = ea?.editor?.get_frontmatter?.(tfile, "emoji");
		const prefix = typeof emoji === "string" && emoji.trim() ? `${emoji.trim()} ` : "";
		return `${prefix}${tfile.basename}`;
	}

	private async runLightboxScript(
		script: TFile,
		item: T,
		info: MediaLightboxItemInfo,
	): Promise<void> {
		const zh = isZhUi();
		const nc = (this.options.app as any).plugins?.plugins?.["note-chain"];
		const ea = nc?.easyapi ?? (window as any).ea;
		if (!ea?.tpl?.parse_templater) {
			new Notice(zh ? "无法执行脚本笔记" : "Cannot run script note");
			return;
		}

		const media: MediaLightboxScriptMedia<T> = {
			path: info.path,
			kind: info.kind,
			item,
			meta: this.options.getMeta(item, this.index, this.items),
			index: this.index,
			items: this.items,
			lightbox: this,
		};

		try {
			await ea.tpl.parse_templater(script, true, { media });
		} catch (err) {
			console.error("[note-chain] lightbox script", script.path, err);
			new Notice(zh
				? `脚本执行失败：${script.basename}`
				: `Script failed: ${script.basename}`);
		}
	}

	private async copyPathToClipboard(path: string): Promise<void> {
		const zh = isZhUi();
		try {
			if (navigator?.clipboard?.writeText) {
				await navigator.clipboard.writeText(path);
				new Notice(zh ? "路径已复制" : "Path copied");
				return;
			}
		} catch { /* fallback */ }
		try {
			const ta = document.createElement("textarea");
			ta.value = path;
			ta.style.position = "fixed";
			ta.style.opacity = "0";
			document.body.appendChild(ta);
			ta.select();
			const ok = document.execCommand("copy");
			ta.remove();
			new Notice(ok
				? (zh ? "路径已复制" : "Path copied")
				: (zh ? "复制路径失败" : "Failed to copy path"));
		} catch {
			new Notice(zh ? "复制路径失败" : "Failed to copy path");
		}
	}

	/** 将当前图片写入系统剪贴板（PNG） */
	private async copyImageToClipboard(path: string | null): Promise<void> {
		const zh = isZhUi();
		try {
			const blob = await this.getCurrentImageBlob(path);
			if (!blob) {
				new Notice(zh ? "无法读取图片" : "Failed to read image");
				return;
			}

			// ① ClipboardItem（Chromium / 较新 Electron）
			if (typeof ClipboardItem !== "undefined" && navigator?.clipboard?.write) {
				await navigator.clipboard.write([
					new ClipboardItem({ [blob.type || "image/png"]: blob }),
				]);
				new Notice(zh ? "图片已复制到剪贴板" : "Image copied to clipboard");
				return;
			}

			// ② Electron nativeImage
			const req = (typeof window !== "undefined" && (window as any).require)
				? (window as any).require
				: null;
			if (req) {
				const electron = req("electron");
				const clipboard = electron?.clipboard ?? electron?.remote?.clipboard;
				const nativeImage = electron?.nativeImage ?? electron?.remote?.nativeImage;
				if (clipboard?.writeImage && nativeImage?.createFromBuffer) {
					const buf = Buffer.from(await blob.arrayBuffer());
					const img = nativeImage.createFromBuffer(buf);
					if (!img.isEmpty()) {
						clipboard.writeImage(img);
						new Notice(zh ? "图片已复制到剪贴板" : "Image copied to clipboard");
						return;
					}
				}
			}

			new Notice(zh ? "当前环境不支持复制图片" : "Copy image not supported here");
		} catch (err) {
			console.error("[note-chain] copyImageToClipboard", err);
			new Notice(zh ? "复制图片失败" : "Failed to copy image");
		}
	}

	private async getCurrentImageBlob(path: string | null): Promise<Blob | null> {
		// 优先用已显示的 <img> 画到 canvas（blob:/data: 通常可用）
		if (
			this.imgEl &&
			!this.imgEl.hidden &&
			this.imgEl.src &&
			this.imgEl.complete &&
			this.imgEl.naturalWidth > 0
		) {
			try {
				const canvas = document.createElement("canvas");
				canvas.width = this.imgEl.naturalWidth;
				canvas.height = this.imgEl.naturalHeight;
				const ctx = canvas.getContext("2d");
				if (ctx) {
					ctx.drawImage(this.imgEl, 0, 0);
					const fromCanvas = await new Promise<Blob | null>((resolve) =>
						canvas.toBlob((b) => resolve(b), "image/png"),
					);
					if (fromCanvas) return fromCanvas;
				}
			} catch { /* 跨域等失败则走 URL */ }
		}

		const url = this.imgEl?.src
			|| (path ? await this.options.resolveUrl(path) : null);
		if (!url) return null;

		if (url.startsWith("data:")) {
			const res = await fetch(url);
			return await res.blob();
		}

		try {
			const res = await fetch(url);
			if (!res.ok) return null;
			const blob = await res.blob();
			if (blob.type.startsWith("image/") || !blob.type) return blob;
			// 非 image mime 时仍尝试当作图片
			return blob;
		} catch {
			return null;
		}
	}

	/** 删除当前条目后刷新；若已空则关闭 */
	removeCurrent(): void {
		if (!this.items.length) {
			this.close(true);
			return;
		}
		this.items.splice(this.index, 1);
		if (!this.items.length) {
			this.close(true);
			return;
		}
		if (this.index >= this.items.length) {
			this.index = this.items.length - 1;
		}
		void this.showCurrent();
	}

	getCurrent(): T | null {
		return this.items[this.index] ?? null;
	}

	open(items: T[], startIndex: number): void {
		if (!items.length) return;
		this.items = items;
		this.index = Math.max(0, Math.min(startIndex, items.length - 1));
		this.isOpen = true;
		this.overlay.addClass("is-open");
		this.overlay.show();
		this.attachKeyScope();
		void this.showCurrent();
	}

	/** @param silent 静默关闭时不触发 onClosed（重绘/销毁/删空） */
	close(silent = false): void {
		const current = this.isOpen ? (this.items[this.index] ?? null) : null;
		this.isOpen = false;
		this.overlay.removeClass("is-open");
		this.session++;
		this.stopPlayback();
		this.overlay.hide();
		this.detachKeyScope();
		if (!silent && current) this.options.onClosed?.(current);
	}

	destroy(): void {
		this.close(true);
		this.stopPlayback();
		this.imgEl.onload = null;
		this.imgEl.onerror = null;
		this.imgEl.removeAttribute("src");
		this.imgEl.src = "";
		this.overlay.remove();
	}

	/**
	 * 用 Keymap Scope 拦截 Esc/方向键，避免 Esc 落到 Modal 默认关闭。
	 * 返回 false 阻止继续向下传递。
	 */
	private attachKeyScope(): void {
		this.detachKeyScope();
		this.keyScope = new Scope();
		this.keyScope.register([], "Escape", () => {
			if (this.closeOnEscape) this.close();
			return false;
		});
		this.keyScope.register([], "ArrowLeft", () => {
			this.go(-1);
			return false;
		});
		this.keyScope.register([], "ArrowRight", () => {
			this.go(1);
			return false;
		});
		this.options.app.keymap.pushScope(this.keyScope);
	}

	private detachKeyScope(): void {
		if (!this.keyScope) return;
		this.options.app.keymap.popScope(this.keyScope);
		this.keyScope = null;
	}

	private go(delta: number): void {
		if (this.items.length <= 1) return;
		if (this.wrapNavigation) {
			this.index = (this.index + delta + this.items.length) % this.items.length;
			void this.showCurrent();
			return;
		}
		const next = this.index + delta;
		if (next < 0 || next >= this.items.length) return;
		this.index = next;
		void this.showCurrent();
	}

	private stopPlayback(): void {
		this.videoEl.pause();
		this.videoEl.removeAttribute("src");
		this.videoEl.load();
		this.audioEl.pause();
		this.audioEl.removeAttribute("src");
		this.audioEl.load();
	}

	private hideAllMedia(): void {
		this.imgEl.hide();
		this.videoEl.hide();
		this.audioPanelEl.hide();
		this.stageEl.querySelector(".nc-cal-lightbox-error")?.remove();
	}

	private setMetaText(el: HTMLElement, text: string | undefined, multiline = false): void {
		const value = (text ?? "").replace(/\\n/g, "\n").trim();
		if (!value) {
			el.empty();
			el.hide();
			return;
		}
		if (multiline) {
			el.empty();
			const lines = value.split("\n");
			lines.forEach((line, i) => {
				el.appendText(line);
				if (i < lines.length - 1) el.appendChild(document.createElement("br"));
			});
		} else {
			el.setText(value);
		}
		el.show();
	}

	private async showCurrent(): Promise<void> {
		const session = ++this.session;
		const item = this.items[this.index];
		if (!item) return;

		this.stopPlayback();
		this.hideAllMedia();

		const meta = this.options.getMeta(item, this.index, this.items);
		this.setMetaText(this.subtitleEl, meta.subtitle);
		this.setMetaText(this.captionEl, meta.title);
		this.setMetaText(this.detailEl, meta.detail, true);
		this.counterEl.setText(meta.counter ?? `${this.index + 1} / ${this.items.length}`);

		const info = this.options.getItemInfo(item);
		if (!info.path) {
			this.showLoadError(info.kind === "audio" ? "file-x" : info.kind === "video" ? "video" : "image-off");
			return;
		}

		const url = await this.options.resolveUrl(info.path);
		if (session !== this.session) return;
		if (!url) {
			this.showLoadError(info.kind === "audio" ? "file-x" : info.kind === "video" ? "video" : "image-off");
			return;
		}

		if (info.kind === "audio") {
			this.audioPanelEl.show();
			this.audioEl.src = url;
			return;
		}

		if (info.kind === "video") {
			this.videoEl.onloadeddata = () => {
				if (session !== this.session) return;
				this.videoEl.show();
			};
			this.videoEl.onerror = () => {
				if (session !== this.session) return;
				this.videoEl.hide();
				this.showLoadError("video");
			};
			this.videoEl.src = url;
			if (this.videoEl.readyState >= 2) this.videoEl.show();
			return;
		}

		this.imgEl.onload = () => {
			if (session !== this.session) return;
			this.imgEl.show();
		};
		this.imgEl.onerror = () => {
			if (session !== this.session) return;
			this.imgEl.hide();
			this.showLoadError("image-off");
		};
		this.imgEl.src = url;
		if (this.imgEl.complete && this.imgEl.naturalWidth > 0) this.imgEl.show();
	}

	private showLoadError(icon: string): void {
		if (this.stageEl.querySelector(".nc-cal-lightbox-error")) return;
		const ph = this.stageEl.createDiv({ cls: "nc-cal-lightbox-error" });
		setIcon(ph, icon);
	}
}
