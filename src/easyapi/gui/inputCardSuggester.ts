import { App, Modal, Notice, setIcon, TFile } from "obsidian";
import { MediaLightbox } from "./mediaLightbox";
import type { AudioItem, ImageItem } from "./calendarGalleryModal";
import { isMobileApp, noteChainPlugin, vaultAdapter } from "../../obsidian-app";

export type { AudioItem, ImageItem };

export type StyledValue = string | [string, Record<string, string>];

export interface CardItem {
    name: StyledValue;
    detail?: StyledValue;
    /**
     * 封面：图标名、单个媒体路径、`[路径, 样式]`、路径数组，或 `ImageItem[]`。
     * 多图/视频请优先使用 `images`（与日历视图相同结构）。
     */
    image?: StyledValue | string[] | ImageItem[] | null;
    /** 图片/视频列表，结构与日历视图 `ImageItem[]` 相同 */
    images?: ImageItem[];
    /** 音频列表，结构与日历视图 `AudioItem[]` 相同 */
    audios?: AudioItem[];
    action?: CardItem[] | ((item: CardItem) => void | Promise<void>);
    file?: TFile | string;
    [key: string]: unknown;
}

export interface CardNavigatorOptions {
    width?: number;
    height?: number;
    cardWidth?: number;
    cardHeight?: number;
    searchPlaceholder?: string;
    /** 初始时希望自动滚动到的卡片 */
    reveal?: CardItem;
    /**
     * 卡片封面图片显示方式：
     * - `cover`：填满裁切（放大看局部，默认）
     * - `contain`：完整显示（可能留边）
     */
    imageFit?: "cover" | "contain";
    /** 是否在卡片上显示音频条；默认 true */
    showAudio?: boolean;
    /**
     * 卡片布局：
     * - `card`：图片、音频、标题、细节（默认）
     * - `gallery`：图片、音频、标题；鼠标悬停标题时才显示细节
     */
    layout?: "card" | "gallery";
    /**
     * 放大预览中删除媒体后回调（文件已尝试删除、卡片数据已更新）。
     * 用于同步外部数据源。
     */
    onDeleteMedia?: (info: {
        item: CardItem;
        path: string;
        kind: "image" | "video" | "audio";
        image?: ImageItem;
        audio?: AudioItem;
    }) => void | Promise<void>;
}

type ResolvedCardNavigatorOptions = Omit<Required<CardNavigatorOptions>, "reveal" | "onDeleteMedia"> & {
    reveal?: CardItem;
    onDeleteMedia?: CardNavigatorOptions["onDeleteMedia"];
};

const DEFAULT_OPTIONS: ResolvedCardNavigatorOptions = {
    width: 800,
    height: 600,
    cardWidth: 200,
    cardHeight: 240,
    searchPlaceholder: "🔍 输入关键词搜索...",
    imageFit: "cover",
    showAudio: true,
    layout: "card",
};

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)(\?.*)?$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|mkv|ogv)(\?.*)?$/i;
const AUDIO_EXT = /\.(mp3|m4a|wav|ogg|flac|aac|wma|opus)(\?.*)?$/i;

interface CardMediaEntry {
	kind: "image" | "video" | "audio";
	item: CardItem;
	image?: ImageItem;
	audio?: AudioItem;
}

interface ResolvedCardMedia {
	images: ImageItem[];
	audios: AudioItem[];
	icon: string | null;
	coverStyle: Record<string, string>;
}

function isZhUi(): boolean {
	return window.localStorage.getItem("language") === "zh";
}

function formatDuration(sec?: number): string {
	if (sec == null || !Number.isFinite(sec)) return "";
	const m = Math.floor(sec / 60);
	const s = Math.floor(sec % 60);
	return `${m}:${s < 10 ? "0" : ""}${s}`;
}

function isDirectMediaUrl(path: string): boolean {
	return /^(https?:\/\/|data:|app:\/\/|blob:)/i.test(path);
}

function isFilesystemPath(path: string): boolean {
	const p = path.trim();
	if (/^file:\/\//i.test(p)) return true;
	if (/^[a-zA-Z]:[\\/]/.test(p)) return true;
	if (/^\\\\/.test(p)) return true;
	if (/^[\/\\]/.test(p)) return true;
	return false;
}

function stripFileUrl(path: string): string {
	let p = path.trim();
	if (/^file:\/\/\//i.test(p)) {
		p = decodeURIComponent(p.slice("file:///".length));
		if (/^[a-zA-Z]:/.test(p)) return p;
		return "/" + p.replace(/^\/+/, "");
	}
	if (/^file:\/\//i.test(p)) {
		return decodeURIComponent(p.slice("file://".length));
	}
	return p;
}

function normalizeMediaPath(raw: string): string {
	let path = raw.trim();
	path = path.replace(/^!\[\[/, "").replace(/^\[\[/, "").replace(/\]\]$/, "");
	if (path.includes("|")) path = path.split("|")[0];
	if (path.includes("#")) path = path.split("#")[0];
	return path.trim();
}

function isVisualMediaKind(path: string): "image" | "video" {
	return VIDEO_EXT.test(normalizeMediaPath(path)) ? "video" : "image";
}

function isMediaPath(path: string): boolean {
	const p = stripFileUrl(normalizeMediaPath(path));
	if (!p) return false;
	if (isDirectMediaUrl(p)) return true;
	if (IMAGE_EXT.test(p) || VIDEO_EXT.test(p) || AUDIO_EXT.test(p)) return true;
	if (isFilesystemPath(p)) return true;
	return false;
}

function isStyleMap(v: unknown): v is Record<string, string> {
	return !!v && typeof v === "object" && !Array.isArray(v) && !("path" in (v as object));
}

function isStyledTuple(v: unknown): v is [string, Record<string, string>] {
	return Array.isArray(v) && v.length === 2 && typeof v[0] === "string" && isStyleMap(v[1]);
}

function isImageItem(v: unknown): v is ImageItem {
	return !!v && typeof v === "object" && !Array.isArray(v) && typeof (v as ImageItem).path === "string";
}

function pathKey(path: string): string {
	return normalizeMediaPath(stripFileUrl(path)).replace(/\\/g, "/").toLowerCase();
}

function toImageItem(entry: string | ImageItem): ImageItem {
	return typeof entry === "string" ? { path: entry } : entry;
}

function splitMediaItem(entry: ImageItem): { image?: ImageItem; audio?: AudioItem } {
	const p = stripFileUrl(normalizeMediaPath(String(entry.path ?? "")));
	if (p && AUDIO_EXT.test(p) && !IMAGE_EXT.test(p) && !VIDEO_EXT.test(p)) {
		return { audio: { path: p, title: entry.caption } };
	}
	return { image: entry };
}

function parseImageField(imageVal: CardItem["image"]): ResolvedCardMedia {
	const empty: ResolvedCardMedia = { images: [], audios: [], icon: null, coverStyle: {} };
	if (imageVal == null) return empty;

	if (isStyledTuple(imageVal)) {
		const raw = String(imageVal[0] ?? "").trim();
		const coverStyle = imageVal[1] ?? {};
		if (!raw) return { ...empty, coverStyle };
		const split = splitMediaItem({ path: raw });
		if (split.audio) return { images: [], audios: [split.audio], icon: null, coverStyle };
		if (isMediaPath(raw)) return { images: [{ path: raw }], audios: [], icon: null, coverStyle };
		return { images: [], audios: [], icon: raw, coverStyle };
	}

	if (Array.isArray(imageVal)) {
		const images: ImageItem[] = [];
		const audios: AudioItem[] = [];
		for (const entry of imageVal) {
			const item = toImageItem(entry as string | ImageItem);
			const split = splitMediaItem(item);
			if (split.audio) audios.push(split.audio);
			else if (split.image) {
				const p = String(split.image.path ?? "").trim();
				if (!p) continue;
				if (isMediaPath(p) || isImageItem(entry)) images.push(split.image);
			}
		}
		return { images, audios, icon: null, coverStyle: {} };
	}

	const raw = String(imageVal).trim();
	if (!raw) return empty;
	const split = splitMediaItem({ path: raw });
	if (split.audio) return { images: [], audios: [split.audio], icon: null, coverStyle: {} };
	if (isMediaPath(raw)) return { images: [{ path: raw }], audios: [], icon: null, coverStyle: {} };
	return { images: [], audios: [], icon: raw, coverStyle: {} };
}

function resolveCardMedia(item: CardItem): ResolvedCardMedia {
	const fromField = parseImageField(item.image);
	const images = item.images?.length ? item.images.slice() : fromField.images;
	const audios = [...(item.audios ?? [])];
	for (const a of fromField.audios) {
		if (!audios.some((x) => pathKey(x.path) === pathKey(a.path))) audios.push(a);
	}

	const visuals: ImageItem[] = [];
	for (const img of images) {
		const split = splitMediaItem(img);
		if (split.audio) {
			if (!audios.some((x) => pathKey(x.path) === pathKey(split.audio!.path))) {
				audios.push(split.audio);
			}
		} else if (split.image) {
			visuals.push(split.image);
		}
	}

	return {
		images: visuals,
		audios,
		icon: item.images?.length ? null : fromField.icon,
		coverStyle: fromField.coverStyle,
	};
}

export class CardNavigatorModal extends Modal {
    private options: ResolvedCardNavigatorOptions;
    private navigationStack: CardItem[][] = [];
    private resolveResult: ((item: CardItem | null) => void) | null = null;
    private resolved = false;
	/** 用于取消过期渲染/异步任务（如图片读取） */
	private renderSession = 0;
	/** 系统文件转 blob 后需在关闭时释放 */
	private mediaObjectUrls: string[] = [];
	/** 图片懒加载：仅在封面滚动进入视口时才真正读取 */
	private mediaObserver: IntersectionObserver | null = null;
	/** 每个待加载封面元素对应的加载回调 */
	private mediaLoaders = new WeakMap<Element, () => void>();
	private mediaLightbox: MediaLightbox<CardMediaEntry> | null = null;
	private cardAudioEl: HTMLAudioElement | null = null;
	private cardAudioBlobUrl: string | null = null;
	private playingAudioWrap: HTMLElement | null = null;
	private playingAudioRestore: (() => void) | null = null;
	private playingAudioPath: string | null = null;
	private audioPlaySession = 0;
	/** 当前卡片列表视图，用于关闭预览后定位到最后查看的卡片 */
	private listView: {
		scrollArea: HTMLElement;
		container: HTMLElement;
		getCurrentList: () => CardItem[];
		ensureRenderedTo: (index: number) => void;
		removeAndRedraw: (item: CardItem) => void;
		redrawItem: (item: CardItem) => void;
	} | null = null;

    constructor(app: App, private rootData: CardItem[], options: CardNavigatorOptions = {}) {
        super(app);
        this.options = { ...DEFAULT_OPTIONS, ...options };
    }

    openAndWait(): Promise<CardItem | null> {
        void this.open();
        return new Promise((resolve) => { this.resolveResult = resolve; });
    }

    onOpen(): void {
        this.modalEl.addClass("nc-card-navigator-modal");
        this.modalEl.style.width = `${this.options.width}px`;
        this.modalEl.style.height = `${this.options.height}px`;

        this.mediaLightbox = new MediaLightbox<CardMediaEntry>({
            app: this.app,
            resolveUrl: (src) => this.resolveCardMediaSrc(src),
            getItemInfo: (entry) => ({
                path: this.getEntryMediaPath(entry),
                kind: entry.kind,
            }),
            getMeta: (entry, index, items) => {
                const caption = entry.kind === "audio"
                    ? (entry.audio?.title?.trim() ?? "")
                    : (entry.image?.caption?.trim() ?? "");
                const cardName = this.getRawText(entry.item.name);
                const cardEntries = items.filter((e) => e.item === entry.item);
                const cardIdx = cardEntries.indexOf(entry);
                const cardPart = cardIdx >= 0 && cardEntries.length > 1
                    ? `${cardIdx + 1}/${cardEntries.length}`
                    : "";
                const globalPart = `${index + 1} / ${items.length}`;
                return {
                    subtitle: caption ? cardName : undefined,
                    title: caption || cardName,
                    detail: this.getRawText(entry.item.detail),
                    counter: cardPart ? `${cardPart} · 总 ${globalPart}` : globalPart,
                };
            },
            onClosed: (entry) => this.revealCardInList(entry.item),
            onContextAction: (action, entry) => {
                void this.handleLightboxContextAction(action, entry);
            },
            onPlaybackStart: () => this.stopCardAudio(),
            wrapNavigation: true,
            closeOnEscape: true,
        });

        const resizer = this.modalEl.createDiv({ cls: "nc-modal-resizer" });
        this.initResizer(resizer);

        // 如果设置了 reveal，尝试定位其所在的层级列表并预先展开
        let initialItems = this.rootData;
        if (this.options.reveal) {
            const path = this.findRevealPath(this.rootData, this.options.reveal);
            if (path && path.length > 0) {
                // path: [rootList, ..., targetList]
                this.navigationStack = path.slice(0, -1);
                initialItems = path[path.length - 1];
            }
        }

        this.renderUI(initialItems, this.navigationStack.length > 0, this.options.reveal);
    }

    private initResizer(resizer: HTMLElement) {
        resizer.addEventListener("mousedown", (e) => {
            e.preventDefault();
            const startX = e.clientX, startY = e.clientY;
            const startW = this.modalEl.offsetWidth, startH = this.modalEl.offsetHeight;
            const onMove = (me: MouseEvent) => {
                this.modalEl.style.width = `${startW + (me.clientX - startX)}px`;
                this.modalEl.style.height = `${startH + (me.clientY - startY)}px`;
            };
            const onUp = () => {
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", onUp);
            };
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
        });
    }

    private renderUI(items: CardItem[], canGoBack: boolean, revealTarget?: CardItem) {
		const session = ++this.renderSession;
		this.mediaLightbox?.close(true);
		this.stopCardAudio();
		this.revokeMediaObjectUrls();
		this.contentEl.empty();
		this.listView = null;
		
        // 1. 顶部导航栏
		const navBar = this.contentEl.createDiv({ cls: "nc-card-navbar" });
	
		// 左侧按钮组 (首页 + 返回上级)
		const btnGroup = navBar.createDiv({ cls: "nc-nav-group" });
		
		// 首页按钮：任何时候点击都回到最初状态
		const homeBtn = btnGroup.createDiv({ cls: "nc-icon-btn", attr: { title: "回到首页" } });
		setIcon(homeBtn, "home");
		homeBtn.onclick = () => {
			this.navigationStack = [];
            this.renderUI(this.rootData, false, this.options.reveal);
		};
	
		// 返回上级按钮（⤴️）：仅在有层级时显示
		if (canGoBack || this.navigationStack.length > 0) {
			const backBtn = btnGroup.createDiv({ cls: "nc-icon-btn", attr: { title: "返回上一级" } });
			backBtn.setText("⤴️");
			backBtn.onclick = () => {
				const prev = this.navigationStack.pop();
                this.renderUI(prev || this.rootData, this.navigationStack.length > 0);
			};
		}
	
		// 右侧搜索框 + 统计 + 🎯 定位按钮
		const searchContainer = navBar.createDiv({ cls: "nc-search-wrapper" });
		const searchInput = searchContainer.createEl("input", {
			cls: "nc-card-search-input",
			attr: { placeholder: this.options.searchPlaceholder }
		});
		const countEl = searchContainer.createDiv({ cls: "nc-card-count" });

        // 🎯 按钮：重新定位到 reveal 目标卡片（如果存在）
        const revealBtn = searchContainer.createDiv({ cls: "nc-icon-btn", attr: { title: "跳转到目标卡片" } });
        revealBtn.setText("🎯");
        if (!this.options.reveal) {
            revealBtn.addClass("is-disabled");
        } else {
            revealBtn.onclick = () => {
                if (!this.options.reveal) return;
                const path = this.findRevealPath(this.rootData, this.options.reveal);
                if (path && path.length > 0) {
                    this.navigationStack = path.slice(0, -1);
                    const targetList = path[path.length - 1];
                    this.renderUI(targetList, this.navigationStack.length > 0, this.options.reveal);
                }
            };
        }
	
		// 2. 卡片容器区域（支持增量加载）
		const scrollArea = this.contentEl.createDiv({ cls: "nc-scroll-area" });
		const container = scrollArea.createDiv({ cls: "nc-card-container" });
		container.style.setProperty("--nc-card-min-width", `${this.options.cardWidth}px`);
		container.style.setProperty("--nc-card-height", `${this.options.cardHeight}px`);
		container.setAttr("data-image-fit", this.options.imageFit);
		container.setAttr("data-layout", this.options.layout);

		// 图片懒加载观察者：仅当封面进入（或临近）视口时才读取，避免上万卡片时一次性读图卡顿
		this.setupMediaObserver(scrollArea);

		const pageSize = 20;
		let currentList: CardItem[] = items;
		let renderedCount = 0;
		let pendingRevealIndex: number | null = revealTarget ? items.indexOf(revealTarget) : null;

		const appendPage = () => {
			if (session !== this.renderSession) return;
			if (!currentList || renderedCount >= currentList.length) return;
			const slice = currentList.slice(renderedCount, renderedCount + pageSize);
			slice.forEach((item) => {
				container.appendChild(this.createCardEl(item, currentList, session, revealTarget));
			});
			renderedCount += slice.length;
		};

		this.listView = {
			scrollArea,
			container,
			getCurrentList: () => currentList,
			ensureRenderedTo: (index: number) => {
				while (renderedCount <= index && renderedCount < currentList.length) {
					appendPage();
				}
			},
			removeAndRedraw: (item: CardItem) => {
				const idx = currentList.indexOf(item);
				if (idx >= 0) currentList.splice(idx, 1);
				if (items !== currentList) {
					const i = items.indexOf(item);
					if (i >= 0) items.splice(i, 1);
				}
				drawCards(currentList, true);
			},
			redrawItem: (item: CardItem) => {
				if (session !== this.renderSession) return;
				const idx = currentList.indexOf(item);
				if (idx < 0 || idx >= renderedCount) return;
				const cards = container.getElementsByClassName("nc-card-btn");
				const el = cards.item(idx) as HTMLElement | null;
				if (!el) return;
				const wasReveal = el.hasClass("nc-card-reveal");
				const newEl = this.createCardEl(item, currentList, session, wasReveal ? item : undefined);
				el.replaceWith(newEl);
			},
		};

		// 渲染函数：重置并只加载首批
		const drawCards = (displayItems: CardItem[], keepLightbox = false) => {
			if (session !== this.renderSession) return;
			this.stopCardAudio();
			if (!keepLightbox) {
				this.mediaLightbox?.close(true);
				this.revokeMediaObjectUrls();
			}
			// 重建观察者，丢弃上一批卡片尚未触发的加载任务
			this.setupMediaObserver(scrollArea);
			currentList = displayItems;
			container.empty();
			renderedCount = 0;
			countEl.setText(`共 ${displayItems.length} 个卡片`);
			appendPage();

			// 如有指定的 reveal 目标，确保其所在页被渲染并自动滚动到视图内
			if (pendingRevealIndex != null && pendingRevealIndex >= 0 && pendingRevealIndex < currentList.length) {
				while (renderedCount <= pendingRevealIndex && renderedCount < currentList.length) {
					appendPage();
				}
				const targetIndex = pendingRevealIndex;
				pendingRevealIndex = null;
				requestAnimationFrame(() => {
					if (session !== this.renderSession) return;
					const cards = container.getElementsByClassName("nc-card-btn");
					const targetEl = cards.item(targetIndex) as HTMLElement | null;
					if (targetEl) {
						const offsetTop = targetEl.offsetTop;
						scrollArea.scrollTop = Math.max(offsetTop - 40, 0);
					}
				});
			}
		};

		// 滚动到底部附近时，按页追加更多卡片
		scrollArea.addEventListener("scroll", () => {
			if (session !== this.renderSession) return;
			const threshold = 120;
			if (scrollArea.scrollTop + scrollArea.clientHeight + threshold >= scrollArea.scrollHeight) {
				appendPage();
			}
		});

		// 初始渲染
		drawCards(items);
	
		// 搜索逻辑（支持正则，如 /2025\d{4}/ 或直接 2025\d{4}）
		searchInput.oninput = (e) => {
			if (session !== this.renderSession) return;
			const val = ((e.target as HTMLInputElement)?.value ?? "").trim();
			searchInput.removeClass("nc-search-invalid");
			if (!val) {
				drawCards(items);
				return;
			}
			const matcher = this.buildMatcher(val);
			if (!matcher) {
				// 正则语法暂不完整（用户仍在输入），标红提示但不刷新结果
				searchInput.addClass("nc-search-invalid");
				return;
			}
			const filtered = this.searchRecursive(this.rootData, matcher);
			drawCards(filtered);
		};
	
		searchInput.focus();
	}

    // 内部快速刷新的方法，避免重绘整个顶部栏
    private renderUI_Plain(filteredItems: CardItem[], container: HTMLElement, originalItems: CardItem[]) {
		const session = this.renderSession;
        container.empty();
        filteredItems.forEach((item) => {
            container.appendChild(this.createCardEl(item, originalItems, session));
        });
    }

	private createCardEl(
		item: CardItem,
		currentList: CardItem[],
		session: number,
		revealTarget?: CardItem,
	): HTMLElement {
		const isFolder = Array.isArray(item.action);
		const media = resolveCardMedia(item);
		const showAudio = this.options.showAudio && media.audios.length > 0;
		const hasVisual = media.images.length > 0;
		const hasIcon = !hasVisual && !!media.icon;
		const hasCover = hasVisual || hasIcon;

		const classes = ["nc-card-btn"];
		if (isFolder) classes.push("nc-is-folder");
		if (!hasCover && !showAudio) classes.push("nc-card-text-only");
		if (hasVisual) classes.push("has-images");
		if (showAudio) classes.push("has-audio");
		if (revealTarget && item === revealTarget) classes.push("nc-card-reveal");

		const card = document.createElement("div");
		card.className = classes.join(" ");

		if (hasCover || showAudio) {
			const mediaEl = card.createDiv({ cls: "nc-card-media" });
			if (hasVisual) {
				this.renderCardImageArea(mediaEl, item, media.images, currentList, session, media.coverStyle);
			} else if (hasIcon) {
				const cover = mediaEl.createDiv({ cls: "nc-card-cover" });
				if (media.coverStyle) Object.assign(cover.style, media.coverStyle);
				this.renderIconOrImage(cover, media.icon, isFolder, session);
			}
			if (showAudio) {
				this.renderCardAudioArea(mediaEl, item, media.audios, currentList);
			}
		}

		const info = card.createDiv({ cls: "nc-card-info" });
		const nameEl = info.createDiv();
		this.renderStyledElement(nameEl, item.name, "nc-card-name");
		if (item.detail) {
			const detailEl = info.createDiv();
			this.renderStyledElement(detailEl, item.detail, "nc-card-detail");
			if (this.options.layout === "gallery") {
				nameEl.addClass("nc-card-name-has-detail");
				// 避免浏览器原生 title 提示盖住细节浮层（原生提示显示的是标题文本）
				nameEl.removeAttribute("title");
				detailEl.removeAttribute("title");
			}
		}

		card.onclick = (e) => {
			const target = e.target as HTMLElement;
			if (target.closest(".nc-cal-carousel-btn, .nc-cal-audio-btn, .nc-cal-img-wrap, .nc-cal-audio-wrap, .nc-card-cover-previewable")) {
				return;
			}
			void this.handleItemClick(item, currentList);
		};

		return card;
	}

	private renderCardImageArea(
		container: HTMLElement,
		item: CardItem,
		images: ImageItem[],
		currentList: CardItem[],
		session: number,
		style: Record<string, string>,
	): void {
		const wrap = container.createDiv({ cls: "nc-card-cover nc-cal-img-wrap nc-card-cover-previewable" });
		wrap.setAttr("title", isZhUi() ? "点击放大预览" : "Click to preview");
		if (style) Object.assign(wrap.style, style);

		const mediaContainer = wrap.createDiv({ cls: "nc-cal-media-container" });
		let imgEl: HTMLImageElement | null = null;
		let current = 0;
		let ready = false;
		let dots: HTMLElement | null = null;

		const showPlaceholder = (icon: string) => {
			imgEl?.hide();
			if (!mediaContainer.querySelector(".nc-cal-img-placeholder")) {
				const ph = mediaContainer.createDiv({ cls: "nc-cal-img-placeholder" });
				setIcon(ph, icon);
			}
		};

		const setMedia = (idx: number) => {
			if (idx < 0 || idx >= images.length) return;
			current = idx;
			wrap.dataset.mediaIndex = String(current);
			const mediaItem = images[current];
			const thumb = mediaItem.thumbnail ?? mediaItem.path;
			const kind = isVisualMediaKind(mediaItem.path);
			mediaContainer.querySelector(".nc-cal-img-placeholder")?.remove();

			dots?.querySelectorAll(".nc-cal-dot").forEach((d, i) => {
				d.toggleClass("is-active", i === current);
			});

			if (!ready) return;

			if (kind === "video" && !mediaItem.thumbnail) {
				if (imgEl) {
					imgEl.hide();
					imgEl.removeAttribute("src");
					imgEl.src = "";
				}
				showPlaceholder("play-circle");
				return;
			}

			if (!imgEl) {
				imgEl = mediaContainer.createEl("img", { cls: "nc-cal-img" });
				imgEl.setAttr("loading", "lazy");
				imgEl.setAttr("decoding", "async");
				imgEl.setAttr("draggable", "false");
				imgEl.onerror = () => showPlaceholder(kind === "video" ? "video" : "image-off");
			}
			imgEl.setAttr("alt", mediaItem.caption ?? mediaItem.path);
			const shownIndex = current;
			void this.resolveCardMediaSrc(stripFileUrl(normalizeMediaPath(thumb))).then((src) => {
				if (session !== this.renderSession || !wrap.isConnected) return;
				if (current !== shownIndex) return;
				if (src) {
					imgEl!.src = src;
					imgEl!.show();
				} else {
					imgEl!.dispatchEvent(new Event("error"));
				}
			}).catch(() => { /* media src resolve failed */ });
		};

		wrap.onclick = (e) => {
			if ((e.target as HTMLElement).closest(".nc-cal-carousel-btn")) return;
			e.stopPropagation();
			this.openCardLightbox(currentList, item, images[current]);
		};

		if (images.length > 1) {
			if (!isMobileApp(this.app)) {
				const prev = wrap.createDiv({ cls: "nc-cal-carousel-btn nc-cal-carousel-prev", attr: { "aria-label": "Previous" } });
				setIcon(prev, "chevron-left");
				const next = wrap.createDiv({ cls: "nc-cal-carousel-btn nc-cal-carousel-next", attr: { "aria-label": "Next" } });
				setIcon(next, "chevron-right");
				prev.onclick = (e) => { e.stopPropagation(); setMedia(current - 1); };
				next.onclick = (e) => { e.stopPropagation(); setMedia(current + 1); };
			}

			dots = wrap.createDiv({ cls: "nc-cal-dots" });
			images.forEach((_, i) => {
				dots!.createDiv({ cls: `nc-cal-dot${i === 0 ? " is-active" : ""}` });
			});

			let wheelLock = false;
			wrap.addEventListener("wheel", (e) => {
				e.preventDefault();
				e.stopPropagation();
				if (wheelLock) return;
				wheelLock = true;
				setMedia(current + (e.deltaY > 0 ? 1 : -1));
				window.setTimeout(() => { wheelLock = false; }, 140);
			}, { passive: false });
		}

		wrap.addClass("nc-card-cover-loading");
		this.observeMedia(wrap, () => {
			if (session !== this.renderSession || !wrap.isConnected) return;
			wrap.removeClass("nc-card-cover-loading");
			ready = true;
			setMedia(current);
		});
		setMedia(0);
	}

	private renderCardAudioArea(
		container: HTMLElement,
		item: CardItem,
		audios: AudioItem[],
		currentList: CardItem[],
	): void {
		const wrap = container.createDiv({ cls: "nc-cal-audio-wrap" });
		let current = 0;

		const label = wrap.createDiv({ cls: "nc-cal-audio-label" });
		const nav = wrap.createDiv({ cls: "nc-cal-audio-nav" });

		const update = () => {
			const audio = audios[current];
			const title = audio.title ?? (isZhUi() ? "录音" : "Voice");
			const dur = formatDuration(audio.duration);
			if (isMobileApp(this.app)) {
				label.setText(audios.length > 1 ? `🎤${current + 1}/${audios.length}` : dur ? `🎤${dur}` : "🎤");
			} else {
				label.setText(dur ? `🎤 ${title} · ${dur}` : `🎤 ${title}`);
			}
		};

		update();

		const playCurrent = (e: MouseEvent) => {
			e.stopPropagation();
			void this.playCardAudio(audios[current], wrap, update);
		};

		label.onclick = playCurrent;

		if (audios.length > 1) {
			const prev = nav.createDiv({ cls: "nc-cal-audio-btn", attr: { "aria-label": "Previous audio" } });
			setIcon(prev, "chevron-left");
			const next = nav.createDiv({ cls: "nc-cal-audio-btn", attr: { "aria-label": "Next audio" } });
			setIcon(next, "chevron-right");
			prev.onclick = (e) => {
				e.stopPropagation();
				if (this.playingAudioWrap === wrap) this.stopCardAudio();
				current = (current - 1 + audios.length) % audios.length;
				update();
			};
			next.onclick = (e) => {
				e.stopPropagation();
				if (this.playingAudioWrap === wrap) this.stopCardAudio();
				current = (current + 1) % audios.length;
				update();
			};
		}

		wrap.onclick = (e) => {
			if ((e.target as HTMLElement).closest(".nc-cal-audio-btn")) return;
			playCurrent(e);
		};

		wrap.oncontextmenu = (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.openCardLightbox(currentList, item, undefined, audios[current]);
		};
	}

	private getCardAudioEl(): HTMLAudioElement {
		if (!this.cardAudioEl) {
			this.cardAudioEl = this.modalEl.createEl("audio", { cls: "nc-hidden-media" });
		}
		return this.cardAudioEl;
	}

	private clearAudioPlayingVisual(): void {
		this.playingAudioWrap?.removeClass("is-playing");
		this.playingAudioWrap = null;
		this.playingAudioRestore?.();
		this.playingAudioRestore = null;
		this.playingAudioPath = null;
	}

	private stopCardAudio(): void {
		this.audioPlaySession++;
		if (this.cardAudioBlobUrl) {
			URL.revokeObjectURL(this.cardAudioBlobUrl);
			this.cardAudioBlobUrl = null;
		}
		if (this.cardAudioEl) {
			this.cardAudioEl.onended = null;
			this.cardAudioEl.pause();
			this.cardAudioEl.removeAttribute("src");
			this.cardAudioEl.load();
		}
		this.clearAudioPlayingVisual();
	}

	private async playCardAudio(
		audio: AudioItem,
		wrap: HTMLElement,
		restoreLabel: () => void,
	): Promise<void> {
		const key = pathKey(audio.path);

		if (this.cardAudioEl && this.playingAudioPath === key && !this.cardAudioEl.paused) {
			this.stopCardAudio();
			return;
		}

		this.mediaLightbox?.pausePlayback();
		this.stopCardAudio();
		const session = this.audioPlaySession;

		const url = await this.resolveCardMediaSrc(stripFileUrl(normalizeMediaPath(audio.path)));
		if (session !== this.audioPlaySession || !url || !wrap.isConnected) return;

		if (url.startsWith("blob:")) this.cardAudioBlobUrl = url;

		const el = this.getCardAudioEl();
		el.pause();
		el.src = url;
		el.load();
		try {
			await el.play();
		} catch {
			return;
		}
		if (session !== this.audioPlaySession) return;

		this.playingAudioWrap = wrap;
		this.playingAudioRestore = restoreLabel;
		this.playingAudioPath = key;
		wrap.addClass("is-playing");
		const label = wrap.querySelector(".nc-cal-audio-label");
		if (label) label.setText(isZhUi() ? "🔊 播放中…" : "🔊 Playing…");

		el.onended = () => this.stopCardAudio();
	}

    /**
     * 根据查询串构建匹配函数：
     * - `/pattern/flags`：显式正则（默认追加 `i` 忽略大小写）。
     * - 含正则元字符且能编译：按正则匹配（忽略大小写）。
     * - 其它：空格分词的 AND 子串匹配（忽略大小写）。
     * 返回 `null` 表示正则语法暂不合法（例如用户仍在输入中）。
     */
    private buildMatcher(query: string): ((text: string) => boolean) | null {
        // 1. 显式 /pattern/flags 写法
        const explicit = query.match(/^\/(.+)\/([a-z]*)$/i);
        if (explicit) {
            try {
                const flags = explicit[2].includes("i") ? explicit[2] : explicit[2] + "i";
                const re = new RegExp(explicit[1], flags);
                return (text) => re.test(text);
            } catch {
                return null;
            }
        }

        // 2. 含正则元字符时，尝试当作正则
        if (/[\\^$.*+?()[\]{}|]/.test(query)) {
            try {
                const re = new RegExp(query, "i");
                return (text) => re.test(text);
            } catch {
                return null;
            }
        }

        // 3. 普通空格分词 AND 子串匹配
        const tokens = query
            .toLowerCase()
            .split(/\s+/)
            .map((t) => t.trim())
            .filter((t) => t.length > 0);
        if (tokens.length === 0) return () => true;
        return (text) => {
            const lower = text.toLowerCase();
            return tokens.every((token) => lower.includes(token));
        };
    }

    private searchRecursive(list: CardItem[], matcher: (text: string) => boolean): CardItem[] {
        let results: CardItem[] = [];

        for (const item of list) {
            const name = this.getRawText(item?.name);
            const detail = this.getRawText(item?.detail);

            const text = `${name} ${detail}`;

            if (matcher(text)) {
                results.push(item);
            }

            if (Array.isArray(item.action)) {
                results.push(...this.searchRecursive(item.action, matcher));
            }
        }

        return [...new Set(results)]; // 去重
    }

    private renderIconOrImage(el: HTMLElement, imageVal: string | null | undefined, isFolder: boolean, _session: number) {
		const imageStr = (imageVal ?? "").trim();
		if (!imageStr) {
			setIcon(el, isFolder ? "folder" : "file-text");
			return;
		}
		try {
			setIcon(el, imageStr);
			if (el.innerHTML === "") el.setText(imageStr);
		} catch {
			el.empty();
			el.setText(imageStr);
		}
	}

	private async resolveCardMediaSrc(raw: string): Promise<string | null> {
		const path = stripFileUrl(normalizeMediaPath(raw));
		if (!path) return null;
		if (isDirectMediaUrl(path)) return path;

		const nc = noteChainPlugin(this.app);
		const fileApi = nc?.easyapi?.file;
		const fsApi = nc?.easyapi?.fs;

		// ① 库内 TFile：直接用 app:// 资源路径，浏览器原生按需解码，无需读入内存
		if (fileApi) {
			try {
				const tfile = fileApi.get_tfile(path);
				if (tfile) {
					return this.app.vault.getResourcePath(tfile);
				}
			} catch {
				/* fall through to filesystem */
			}
		}

		// ② 系统绝对路径 / 库外文件：异步读取为 blob URL（避免同步读图卡住主线程）
		if (fsApi) {
			try {
				const abs = fsApi.abspath(path, true) || (fsApi.isfile(path) ? path : null);
				if (abs && fsApi.isfile(abs)) {
					const mime = this.guessMediaMimeType(abs);
					const buf = fsApi.fs.promises?.readFile
						? await fsApi.fs.promises.readFile(abs)
						: fsApi.fs.readFileSync(abs);
					const url = URL.createObjectURL(new Blob([buf as BlobPart], { type: mime }));
					this.mediaObjectUrls.push(url);
					return url;
				}
			} catch {
				return null;
			}
		}

		return null;
	}

	/** (重新)创建懒加载观察者，绑定到指定滚动容器 */
	private setupMediaObserver(scrollArea: HTMLElement) {
		this.mediaObserver?.disconnect();
		this.mediaLoaders = new WeakMap();
		this.mediaObserver = new IntersectionObserver(
			(entries, observer) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;
					const target = entry.target;
					const loader = this.mediaLoaders.get(target);
					observer.unobserve(target);
					this.mediaLoaders.delete(target);
					loader?.();
				}
			},
			// 提前 300px 预加载，让滚动时封面已就绪，观感更顺滑
			{ root: scrollArea, rootMargin: "300px 0px" },
		);
	}

	/** 登记一个封面元素，进入视口时触发其加载回调 */
	private observeMedia(el: HTMLElement, loader: () => void) {
		if (!this.mediaObserver) {
			loader();
			return;
		}
		this.mediaLoaders.set(el, loader);
		this.mediaObserver.observe(el);
	}

	private buildVisibleMediaList(list: CardItem[]): CardMediaEntry[] {
		const entries: CardMediaEntry[] = [];
		for (const item of list) {
			const media = resolveCardMedia(item);
			for (const image of media.images) {
				entries.push({
					kind: isVisualMediaKind(image.path),
					item,
					image,
				});
			}
			if (this.options.showAudio) {
				for (const audio of media.audios) {
					entries.push({ kind: "audio", item, audio });
				}
			}
		}
		return entries;
	}

	private getEntryMediaPath(entry: CardMediaEntry): string | null {
		if (entry.kind === "audio") {
			const p = entry.audio?.path?.trim();
			return p ? stripFileUrl(normalizeMediaPath(p)) : null;
		}
		const p = entry.image?.path?.trim();
		return p ? stripFileUrl(normalizeMediaPath(p)) : null;
	}

	/** 打开当前列表中可预览媒体的放大层；左右键/滚轮可切换 */
	private openCardLightbox(
		list: CardItem[],
		target: CardItem,
		targetImage?: ImageItem,
		targetAudio?: AudioItem,
	): void {
		const entries = this.buildVisibleMediaList(list);
		if (!entries.length) return;
		let idx = -1;
		if (targetImage) {
			idx = entries.findIndex((e) => e.item === target && e.image === targetImage);
			if (idx < 0) {
				const key = pathKey(targetImage.path);
				idx = entries.findIndex((e) => e.item === target && e.image && pathKey(e.image.path) === key);
			}
		} else if (targetAudio) {
			idx = entries.findIndex((e) => e.item === target && e.audio === targetAudio);
			if (idx < 0) {
				const key = pathKey(targetAudio.path);
				idx = entries.findIndex((e) => e.item === target && e.audio && pathKey(e.audio.path) === key);
			}
		}
		if (idx < 0) idx = entries.findIndex((e) => e.item === target);
		this.mediaLightbox?.open(entries, idx >= 0 ? idx : 0);
	}

	private async handleLightboxContextAction(
		action: "delete" | "reveal",
		entry: CardMediaEntry,
	): Promise<void> {
		if (action === "reveal") {
			await this.revealCardMediaInExplorer(entry);
			return;
		}
		await this.deleteCardMedia(entry);
	}

	private resolveLocalAbsPath(rawPath: string): string | null {
		const path = stripFileUrl(normalizeMediaPath(rawPath));
		if (!path || isDirectMediaUrl(path)) return null;

		const nc = noteChainPlugin(this.app);
		const fsApi = nc?.easyapi?.fs;
		const fileApi = nc?.easyapi?.file;
		const adapter = vaultAdapter(this.app);

		const tfile = fileApi?.get_tfile?.(path) as TFile | null;
		if (tfile) {
			if (typeof adapter?.getFullPath === "function") {
				const full = adapter.getFullPath(tfile.path);
				if (full) return full;
			}
			if (fsApi?.abspath) {
				const abs = fsApi.abspath(tfile, true);
				if (abs) return abs;
			}
		}
		if (fsApi) {
			const abs = fsApi.abspath(path, true) || (fsApi.isfile(path) ? path : null);
			if (abs && fsApi.isfile(abs)) return abs;
		}
		if (typeof adapter?.getFullPath === "function" && !isFilesystemPath(path)) {
			const full = adapter.getFullPath(path);
			if (full && fsApi?.isfile?.(full)) return full;
		}
		if (isFilesystemPath(path)) return path;
		return null;
	}

	private async revealCardMediaInExplorer(entry: CardMediaEntry): Promise<void> {
		if (isMobileApp(this.app)) {
			new Notice(isZhUi() ? "移动端不支持在文件浏览器中打开" : "Not supported on mobile");
			return;
		}
		const mediaPath = this.getEntryMediaPath(entry);
		if (!mediaPath) {
			new Notice(isZhUi() ? "无法定位文件路径" : "Cannot resolve file path");
			return;
		}
		if (isDirectMediaUrl(mediaPath) && !/^file:/i.test(mediaPath)) {
			new Notice(isZhUi() ? "网络资源无法在文件浏览器中打开" : "Remote URL cannot be revealed in explorer");
			return;
		}
		const nc = noteChainPlugin(this.app);
		const fsApi = nc?.easyapi?.fs;
		if (!fsApi?.show_in_system_explorer) {
			new Notice(isZhUi() ? "文件系统接口不可用" : "Filesystem API unavailable");
			return;
		}
		const target = isFilesystemPath(mediaPath)
			? mediaPath
			: (this.resolveLocalAbsPath(mediaPath) ?? mediaPath);
		const ok = fsApi.show_in_system_explorer(target);
		if (!ok) {
			new Notice(isZhUi() ? `打开文件位置失败：${target}` : `Failed to show in explorer: ${target}`);
		}
	}

	private removeMediaFromCard(item: CardItem, path: string, kind: "image" | "video" | "audio"): void {
		const key = pathKey(path);
		const matches = (p: string) => pathKey(p) === key;

		if (kind === "audio") {
			if (item.audios?.length) {
				item.audios = item.audios.filter((a) => !matches(a.path));
			}
		} else if (item.images?.length) {
			item.images = item.images.filter((img) => !matches(img.path));
		}

		if (item.image == null) return;

		if (isStyledTuple(item.image)) {
			if (matches(String(item.image[0] ?? ""))) item.image = null;
			return;
		}
		if (Array.isArray(item.image)) {
			item.image = (item.image as Array<string | ImageItem>).filter((entry) => {
				const p = typeof entry === "string" ? entry : entry.path;
				return !matches(p);
			}) as string[] | ImageItem[];
			if ((item.image as unknown[]).length === 0) item.image = null;
			return;
		}
		if (matches(String(item.image))) item.image = null;
	}

	private async deleteCardMedia(entry: CardMediaEntry): Promise<void> {
		const mediaPath = this.getEntryMediaPath(entry);
		if (!mediaPath) {
			new Notice(isZhUi() ? "无法定位文件路径" : "Cannot resolve file path");
			return;
		}
		const kind = entry.kind;
		const kindLabel = kind === "audio"
			? (isZhUi() ? "音频" : "audio")
			: kind === "video"
				? (isZhUi() ? "视频" : "video")
				: (isZhUi() ? "图片" : "image");
		const ok = window.confirm(
			isZhUi()
				? `确定删除此${kindLabel}？\n${mediaPath}`
				: `Delete this ${kindLabel}?\n${mediaPath}`,
		);
		if (!ok) return;

		const deleted = await this.deleteLocalMediaFile(mediaPath);
		if (!deleted && isDirectMediaUrl(mediaPath) && !/^file:/i.test(mediaPath)) {
			new Notice(isZhUi() ? "网络资源无法删除本地文件，仅从列表中移除" : "Remote URL: removed from list only");
		}

		this.removeMediaFromCard(entry.item, mediaPath, kind);
		try {
			await this.options.onDeleteMedia?.({
				item: entry.item,
				path: mediaPath,
				kind,
				image: entry.image,
				audio: entry.audio,
			});
		} catch (err) {
			console.error("[note-chain] onDeleteMedia", err);
		}

		this.mediaLightbox?.removeCurrent();
		this.listView?.redrawItem(entry.item);
		new Notice(isZhUi() ? `已删除${kindLabel}` : `${kindLabel} deleted`);
	}

	private async deleteLocalMediaFile(mediaPath: string): Promise<boolean> {
		if (isDirectMediaUrl(mediaPath) && !/^file:/i.test(mediaPath)) return false;
		const nc = noteChainPlugin(this.app);
		const fileApi = nc?.easyapi?.file;
		const fsApi = nc?.easyapi?.fs;
		try {
			const tfile = fileApi?.get_tfile?.(mediaPath) as TFile | null;
			if (tfile) {
				await this.app.vault.trash(tfile, true);
				return true;
			}
			const abs = this.resolveLocalAbsPath(mediaPath);
			if (abs && fsApi?.isfile?.(abs)) {
				fsApi.delete_file_or_dir(abs);
				return true;
			}
		} catch (err) {
			console.error("[note-chain] deleteLocalMediaFile", err);
			new Notice("删除文件失败");
			return false;
		}
		return false;
	}

	/** 关闭放大预览后，滚动并高亮到最后查看的媒体所在卡片 */
	private revealCardInList(item: CardItem): void {
		const view = this.listView;
		if (!view) return;
		const list = view.getCurrentList();
		const index = list.indexOf(item);
		if (index < 0) return;

		view.ensureRenderedTo(index);
		requestAnimationFrame(() => {
			const cards = view.container.getElementsByClassName("nc-card-btn");
			const targetEl = cards.item(index) as HTMLElement | null;
			if (!targetEl) return;

			view.container.querySelectorAll(".nc-card-reveal").forEach((el) => {
				el.removeClass("nc-card-reveal");
			});
			targetEl.addClass("nc-card-reveal");
			view.scrollArea.scrollTop = Math.max(targetEl.offsetTop - 40, 0);
		});
	}

    private guessMediaMimeType(path: string): string {
        const lower = path.toLowerCase().split("?")[0];
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".gif")) return "image/gif";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".bmp")) return "image/bmp";
        if (lower.endsWith(".avif")) return "image/avif";
        if (lower.endsWith(".webm")) return "video/webm";
        if (lower.endsWith(".mp4") || lower.endsWith(".m4v")) return "video/mp4";
        if (lower.endsWith(".mov")) return "video/quicktime";
        if (lower.endsWith(".mkv")) return "video/x-matroska";
        if (lower.endsWith(".ogv")) return "video/ogg";
        if (lower.endsWith(".m4a")) return "audio/mp4";
        if (lower.endsWith(".mp3")) return "audio/mpeg";
        if (lower.endsWith(".wav")) return "audio/wav";
        if (lower.endsWith(".ogg")) return "audio/ogg";
        if (lower.endsWith(".flac")) return "audio/flac";
        if (lower.endsWith(".aac")) return "audio/aac";
        if (lower.endsWith(".wma")) return "audio/x-ms-wma";
        if (lower.endsWith(".opus")) return "audio/opus";
        return "image/png";
    }

	private revokeMediaObjectUrls() {
		for (const url of this.mediaObjectUrls) {
			try { URL.revokeObjectURL(url); } catch { /* ignore */ }
		}
		this.mediaObjectUrls = [];
	}

    private renderStyledElement(el: HTMLElement, value: StyledValue | undefined, cls: string) {
        if (!value) return;
        el.addClass(cls);
        if (cls === "nc-card-detail") {
            const raw = this.getRawText(value);
            const normalized = typeof raw === "string" ? raw.replace(/\\n/g, "\n") : String(raw);
            const lines = normalized.split("\n");
            el.empty();
            lines.forEach((line, i) => {
                el.appendText(line);
                if (i < lines.length - 1) el.appendChild(document.createElement("br"));
            });
            el.setAttr("title", normalized.replace(/\n/g, " "));
            if (Array.isArray(value) && value[1]) Object.assign(el.style, value[1]);
            return;
        }
        if (Array.isArray(value)) {
            const text = this.getRawText(value);
            el.setText(text);
            if (value[1]) Object.assign(el.style, value[1]);
            el.setAttr("title", text);
        } else {
            el.setText(value != null ? String(value) : "");
            el.setAttr("title", value != null ? String(value) : "");
        }
    }

    // 从整棵树中找到 target 所在的列表路径（按引用匹配）
    private findRevealPath(list: CardItem[], target: CardItem, stack: CardItem[][] = []): CardItem[][] | null {
        const nextStack = [...stack, list];
        for (const item of list) {
            if (item === target) {
                return nextStack;
            }
            if (Array.isArray(item.action)) {
                const found = this.findRevealPath(item.action, target, nextStack);
                if (found) return found;
            }
        }
        return null;
    }

    private getRawText(val: StyledValue | undefined): string {
        if (val == null) return "";
        if (Array.isArray(val)) return val[0] != null ? String(val[0]) : "";
        return String(val);
    }

    private async handleItemClick(item: CardItem, currentList: CardItem[]) {
        if (Array.isArray(item.action)) {
            this.navigationStack.push(currentList);
            this.renderUI(item.action, true);
        } else {
            this.resolved = true;
            // 先关闭/返回结果，避免在大量 DOM 仍在页面上时执行重逻辑导致卡顿
            if (this.resolveResult) this.resolveResult(item);
            this.close();
            // 将实际 action 延后到下一帧执行，让 Obsidian 先完成关闭 modal 的布局/绘制
            const action = item.action;
            if (action) {
                requestAnimationFrame(() => {
                    void Promise.resolve(action(item));
                });
            }
        }
    }

    onClose() {
		// 取消所有过期的异步任务（如图片读取）
		this.renderSession++;
		this.stopCardAudio();
		this.mediaLightbox?.destroy();
		this.mediaLightbox = null;
		this.mediaObserver?.disconnect();
		this.mediaObserver = null;
		this.listView = null;
		this.revokeMediaObjectUrls();
		if (this.cardAudioEl) {
			this.cardAudioEl.remove();
			this.cardAudioEl = null;
		}
        if (!this.resolved && this.resolveResult) this.resolveResult(null);
        this.contentEl.empty();
    }
}

export async function openCardNavigator(this: { app: App }, data: CardItem[], options?: CardNavigatorOptions) {
    return new CardNavigatorModal(this.app, data, options).openAndWait();
}