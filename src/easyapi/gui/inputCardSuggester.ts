import { App, Modal, setIcon } from "obsidian";

export type StyledValue = string | [string, Record<string, string>];

export interface CardItem {
    name: StyledValue;
    detail?: StyledValue;
    image?: StyledValue | null;
    action?: CardItem[] | ((item: CardItem) => void | Promise<void>);
    [key: string]: any;
}

export interface CardNavigatorOptions {
    width?: number;
    height?: number;
    cardWidth?: number;
    cardHeight?: number;
    searchPlaceholder?: string;
    /** 初始时希望自动滚动到的卡片 */
    reveal?: CardItem;
}

type ResolvedCardNavigatorOptions = Omit<Required<CardNavigatorOptions>, "reveal"> & {
    reveal?: CardItem;
};

const DEFAULT_OPTIONS: ResolvedCardNavigatorOptions = {
    width: 800,
    height: 600,
    cardWidth: 200,
    cardHeight: 240,
    searchPlaceholder: "🔍 输入关键词搜索...",
};

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)(\?.*)?$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|mkv|ogv)(\?.*)?$/i;

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

    constructor(app: App, private rootData: CardItem[], options: CardNavigatorOptions = {}) {
        super(app);
        this.options = { ...DEFAULT_OPTIONS, ...options };
    }

    openAndWait(): Promise<CardItem | null> {
        this.open();
        return new Promise((resolve) => { this.resolveResult = resolve; });
    }

    onOpen(): void {
        this.modalEl.addClass("nc-card-navigator-modal");
        this.modalEl.style.width = `${this.options.width}px`;
        this.modalEl.style.height = `${this.options.height}px`;

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
		this.revokeMediaObjectUrls();
		this.contentEl.empty();
		
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
				const isFolder = Array.isArray(item.action);
				const hasImage = item.image != null;
				const classes = [`nc-card-btn`];
				if (isFolder) classes.push("nc-is-folder");
				if (!hasImage) classes.push("nc-card-text-only");
				if (revealTarget && item === revealTarget) classes.push("nc-card-reveal");
				const card = container.createDiv({ cls: classes.join(" ") });
				if (hasImage) {
					const cover = card.createDiv({ cls: "nc-card-cover" });
					this.renderIconOrImage(cover, item.image, isFolder, session);
				}
				const info = card.createDiv({ cls: "nc-card-info" });
				this.renderStyledElement(info.createDiv(), item.name, "nc-card-name");
				if (item.detail) this.renderStyledElement(info.createDiv(), item.detail, "nc-card-detail");
				card.onclick = () => this.handleItemClick(item, currentList);
			});
			renderedCount += slice.length;
		};

		// 渲染函数：重置并只加载首批
		const drawCards = (displayItems: CardItem[]) => {
			if (session !== this.renderSession) return;
			this.revokeMediaObjectUrls();
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
	
		// 搜索逻辑
		searchInput.oninput = (e) => {
			if (session !== this.renderSession) return;
			const val = ((e.target as HTMLInputElement)?.value ?? "").toLowerCase();
			if (!val) {
				drawCards(items);
				return;
			}
			const filtered = this.searchRecursive(this.rootData, val);
			drawCards(filtered);
		};
	
		searchInput.focus();
	}

    // 内部快速刷新的方法，避免重绘整个顶部栏
    private renderUI_Plain(filteredItems: CardItem[], container: HTMLElement, originalItems: CardItem[]) {
		const session = this.renderSession;
        container.empty();
        filteredItems.forEach((item) => {
            const isFolder = Array.isArray(item.action);
            const hasImage = item.image != null;
            const card = container.createDiv({
                cls: `nc-card-btn ${isFolder ? "nc-is-folder" : ""}${hasImage ? "" : " nc-card-text-only"}`.trim(),
            });
            if (hasImage) {
                const cover = card.createDiv({ cls: "nc-card-cover" });
                this.renderIconOrImage(cover, item.image, isFolder, session);
            }
            const info = card.createDiv({ cls: "nc-card-info" });
            this.renderStyledElement(info.createDiv(), item.name, "nc-card-name");
            if (item.detail) this.renderStyledElement(info.createDiv(), item.detail, "nc-card-detail");
            card.onclick = () => this.handleItemClick(item, originalItems);
        });
    }

    private searchRecursive(list: CardItem[], query: string): CardItem[] {
        const tokens = query
            .split(/\s+/)
            .map((t) => t.trim())
            .filter((t) => t.length > 0);

        if (tokens.length === 0) return list;

        let results: CardItem[] = [];

        for (const item of list) {
            const name = this.getRawText(item?.name).toLowerCase();
            const detail = this.getRawText(item?.detail).toLowerCase();

            const text = `${name} ${detail}`;

            const matched = tokens.every((token) => text.includes(token));

            if (matched) {
                results.push(item);
            }

            if (Array.isArray(item.action)) {
                results.push(...this.searchRecursive(item.action, query));
            }
        }

        return [...new Set(results)]; // 去重
    }

    private renderIconOrImage(el: HTMLElement, imageVal: StyledValue | null | undefined, isFolder: boolean, session: number) {
		
        let rawImage: unknown = "";
        let style: Record<string, string> = {};

        if (Array.isArray(imageVal)) {
            rawImage = imageVal[0];
            if (imageVal[1]) style = imageVal[1];
        } else {
            rawImage = imageVal ?? "";
        }

        if (style) Object.assign(el.style, style);

        const imageStr = rawImage == null ? "" : String(rawImage).trim();

        if (!imageStr) {
            setIcon(el, isFolder ? "folder" : "file-text");
            return;
        }

        // 1. 远程 / data / app / blob URL：直接挂载
        if (/^(https?:\/\/|data:|app:\/\/|blob:)/i.test(imageStr)) {
            this.mountCardMedia(el, imageStr, style, imageStr);
            return;
        }

        // 2. 库内相对路径、绝对系统路径（含 Windows 盘符 / file://）、视频：
        //    先放占位骨架，交给 IntersectionObserver 在滚动进入视口时才真正读取
        if (IMAGE_EXT.test(imageStr) || VIDEO_EXT.test(imageStr) || this.isFilesystemPath(imageStr)) {
            el.addClass("nc-card-cover-loading");
            const load = async () => {
                try {
                    if (session !== this.renderSession || !el.isConnected) return;
                    const src = await this.resolveCardMediaSrc(imageStr);
                    if (session !== this.renderSession || !el.isConnected) return;
                    el.removeClass("nc-card-cover-loading");
                    if (!src) {
                        setIcon(el, isFolder ? "folder" : "file-text");
                        return;
                    }
                    this.mountCardMedia(el, src, style, imageStr);
                } catch {
                    // 读取失败时退回到默认图标，而不是抛错
                    if (el.isConnected) {
                        el.removeClass("nc-card-cover-loading");
                        setIcon(el, isFolder ? "folder" : "file-text");
                    }
                }
            };
            this.observeMedia(el, () => { void load(); });
            return;
        }

        // 3. 其它：优先当作图标 ID，失败时退化为纯文本
        try {
            setIcon(el, imageStr);
            if (el.innerHTML === "") el.setText(imageStr);
        } catch {
            el.empty();
            el.setText(imageStr);
        }
    }

	/** Windows 盘符、UNC、Unix 绝对路径、file:// */
	private isFilesystemPath(path: string): boolean {
		const p = path.trim();
		if (/^file:\/\//i.test(p)) return true;
		if (/^[a-zA-Z]:[\\/]/.test(p)) return true;
		if (/^\\\\/.test(p)) return true;
		if (/^[\/\\]/.test(p)) return true;
		return false;
	}

	private stripFileUrl(path: string): string {
		let p = path.trim();
		if (/^file:\/\/\//i.test(p)) {
			p = decodeURIComponent(p.slice("file:///".length));
			// file:///C:/foo → C:/foo；file:///home/foo 保持 /home/foo
			if (/^[a-zA-Z]:/.test(p)) return p;
			return "/" + p.replace(/^\/+/, "");
		}
		if (/^file:\/\//i.test(p)) {
			return decodeURIComponent(p.slice("file://".length));
		}
		return p;
	}

	private async resolveCardMediaSrc(raw: string): Promise<string | null> {
		const path = this.stripFileUrl(raw);
		if (!path) return null;

		const nc = (this.app as any).plugins?.plugins?.["note-chain"];
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

	private mountCardMedia(
		el: HTMLElement,
		src: string,
		style: Record<string, string>,
		pathHint: string,
	) {
		el.empty();
		const hint = this.stripFileUrl(pathHint);
		if (VIDEO_EXT.test(hint) || VIDEO_EXT.test(src)) {
			const video = el.createEl("video", {
				attr: {
					src,
					muted: "true",
					playsinline: "true",
					preload: "metadata",
				},
			});
			if (style) Object.assign(video.style, style);
			return;
		}
		const img = el.createEl("img", { attr: { src, loading: "lazy", decoding: "async" } });
		if (style) Object.assign(img.style, style);
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
		this.mediaObserver?.disconnect();
		this.mediaObserver = null;
		this.revokeMediaObjectUrls();
        if (!this.resolved && this.resolveResult) this.resolveResult(null);
        this.contentEl.empty();
    }
}

export async function openCardNavigator(data: CardItem[], options?: CardNavigatorOptions) {
    return new CardNavigatorModal(this.app, data, options).openAndWait();
}