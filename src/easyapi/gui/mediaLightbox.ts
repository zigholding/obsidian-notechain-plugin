import { Menu, setIcon } from "obsidian";

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

export interface MediaLightboxOptions<T> {
	resolveUrl: (src: string) => Promise<string | null>;
	getItemInfo: (item: T) => MediaLightboxItemInfo;
	getMeta: (item: T, index: number, items: T[]) => MediaLightboxMeta;
	onContextAction?: (action: "delete" | "reveal", item: T) => void | Promise<void>;
	onClosed?: (item: T) => void;
	/** 左右切换是否循环；默认 false */
	wrapNavigation?: boolean;
	/** Esc 是否关闭 lightbox；默认 true */
	closeOnEscape?: boolean;
	/** 滚轮切换防抖（ms）；默认 140 */
	wheelDebounceMs?: number;
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
	private readonly wrapNavigation: boolean;
	private readonly closeOnEscape: boolean;
	private readonly wheelDebounceMs: number;

	private onKeyDown = (e: KeyboardEvent) => {
		if (e.key === "Escape") {
			if (!this.closeOnEscape) return;
			e.stopPropagation();
			this.close();
		} else if (e.key === "ArrowLeft") {
			e.preventDefault();
			e.stopPropagation();
			this.go(-1);
		} else if (e.key === "ArrowRight") {
			e.preventDefault();
			e.stopPropagation();
			this.go(1);
		}
	};

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
		if (!item || !this.options.onContextAction) return;

		const { kind } = this.options.getItemInfo(item);
		const zh = isZhUi();
		const deleteLabel = zh
			? (kind === "audio" ? "删除音频" : kind === "video" ? "删除视频" : "删除图片")
			: (kind === "audio" ? "Delete audio" : kind === "video" ? "Delete video" : "Delete image");
		const revealLabel = zh
			? (kind === "audio" ? "在文件浏览器中打开音频位置" : kind === "video" ? "在文件浏览器中打开视频位置" : "在文件浏览器中打开图片位置")
			: "Show in system explorer";

		const menu = new Menu();
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
		menu.showAtPosition({ x: e.clientX, y: e.clientY });
		window.setTimeout(() => {
			document.querySelectorAll("body > .menu, .menu").forEach((el) => {
				(el as HTMLElement).style.setProperty("z-index", "100001", "important");
			});
		}, 0);
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
		document.addEventListener("keydown", this.onKeyDown, true);
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
		document.removeEventListener("keydown", this.onKeyDown, true);
		if (!silent && current) this.options.onClosed?.(current);
	}

	destroy(): void {
		this.close(true);
		this.overlay.remove();
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
