import { App, Modal, setIcon } from "obsidian";

export type StyledValue = string | [string, Record<string, string>];

export interface CardItem {
    name: StyledValue;
    detail?: StyledValue;
    image?: StyledValue;
    action?: CardItem[] | ((item: CardItem) => void | Promise<void>);
    [key: string]: any;
}

export interface CardNavigatorOptions {
    width?: number;
    height?: number;
    cardWidth?: number;
    cardHeight?: number;
    searchPlaceholder?: string;
}

const DEFAULT_OPTIONS: Required<CardNavigatorOptions> = {
    width: 800,
    height: 600,
    cardWidth: 200,
    cardHeight: 240,
    searchPlaceholder: "🔍 输入关键词搜索...",
};

export class CardNavigatorModal extends Modal {
    private options: Required<CardNavigatorOptions>;
    private navigationStack: CardItem[][] = [];
    private resolveResult: ((item: CardItem | null) => void) | null = null;
    private resolved = false;

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

        this.renderUI(this.rootData, false);
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

    private renderUI(items: CardItem[], canGoBack: boolean) {
		this.contentEl.empty();
		
		// 1. 顶部导航栏
		const navBar = this.contentEl.createDiv({ cls: "nc-card-navbar" });
	
		// 左侧按钮组 (首页 + 返回)
		const btnGroup = navBar.createDiv({ cls: "nc-nav-group" });
		
		// 首页按钮：任何时候点击都回到最初状态
		const homeBtn = btnGroup.createDiv({ cls: "nc-icon-btn", attr: { title: "回到首页" } });
		setIcon(homeBtn, "home");
		homeBtn.onclick = () => {
			this.navigationStack = [];
			this.renderUI(this.rootData, false);
		};
	
		// 返回按钮：仅在有层级时显示
		if (canGoBack || this.navigationStack.length > 0) {
			const backBtn = btnGroup.createDiv({ cls: "nc-icon-btn", attr: { title: "返回上一级" } });
			setIcon(backBtn, "arrow-left");
			backBtn.onclick = () => {
				const prev = this.navigationStack.pop();
				this.renderUI(prev || this.rootData, this.navigationStack.length > 0);
			};
		}
	
		// 右侧搜索框 + 统计
		const searchContainer = navBar.createDiv({ cls: "nc-search-wrapper" });
		const searchInput = searchContainer.createEl("input", {
			cls: "nc-card-search-input",
			attr: { placeholder: this.options.searchPlaceholder }
		});
		const countEl = searchContainer.createDiv({ cls: "nc-card-count" });
	
		// 2. 卡片容器区域（支持增量加载）
		const scrollArea = this.contentEl.createDiv({ cls: "nc-scroll-area" });
		const container = scrollArea.createDiv({ cls: "nc-card-container" });
		container.style.setProperty("--nc-card-min-width", `${this.options.cardWidth}px`);
		container.style.setProperty("--nc-card-height", `${this.options.cardHeight}px`);

		const pageSize = 20;
		let currentList: CardItem[] = items;
		let renderedCount = 0;

		const appendPage = () => {
			if (!currentList || renderedCount >= currentList.length) return;
			const slice = currentList.slice(renderedCount, renderedCount + pageSize);
			slice.forEach((item) => {
				const isFolder = Array.isArray(item.action);
				const card = container.createDiv({ cls: `nc-card-btn ${isFolder ? 'nc-is-folder' : ''}` });
				const cover = card.createDiv({ cls: "nc-card-cover" });
				this.renderIconOrImage(cover, item.image, isFolder);
				const info = card.createDiv({ cls: "nc-card-info" });
				this.renderStyledElement(info.createDiv(), item.name, "nc-card-name");
				if (item.detail) this.renderStyledElement(info.createDiv(), item.detail, "nc-card-detail");
				card.onclick = () => this.handleItemClick(item, items);
			});
			renderedCount += slice.length;
		};

		// 渲染函数：重置并只加载首批
		const drawCards = (displayItems: CardItem[]) => {
			currentList = displayItems;
			container.empty();
			renderedCount = 0;
			countEl.setText(`共 ${displayItems.length} 个卡片`);
			appendPage();
		};

		// 滚动到底部附近时，按页追加更多卡片
		scrollArea.addEventListener("scroll", () => {
			const threshold = 120;
			if (scrollArea.scrollTop + scrollArea.clientHeight + threshold >= scrollArea.scrollHeight) {
				appendPage();
			}
		});

		// 初始渲染
		drawCards(items);
	
		// 搜索逻辑
		searchInput.oninput = (e) => {
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
        container.empty();
        filteredItems.forEach((item) => {
            const isFolder = Array.isArray(item.action);
            const card = container.createDiv({ cls: `nc-card-btn ${isFolder ? 'nc-is-folder' : ''}` });
            const cover = card.createDiv({ cls: "nc-card-cover" });
            this.renderIconOrImage(cover, item.image, isFolder);
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

    private renderIconOrImage(el: HTMLElement, imageVal: StyledValue | undefined, isFolder: boolean) {
		
        let rawImage: unknown = "";
        let style: Record<string, string> = {};

        if (Array.isArray(imageVal)) {
            rawImage = imageVal[0];
            if (imageVal[1]) style = imageVal[1];
        } else {
            rawImage = imageVal ?? "";
        }

        if (style) Object.assign(el.style, style);

        const imageStr = rawImage == null ? "" : String(rawImage);

        if (!imageStr) {
            setIcon(el, isFolder ? "folder" : "file-text");
            return;
        }

        // 1. 已经是可用 URL / data-url / app 路径：直接作为 <img> src
        if (/^(https?:\/\/|data:|app:\/\/|\/|\\)/.test(imageStr)) {
            const img = el.createEl("img", { attr: { src: imageStr } });
            if (style) Object.assign(img.style, style);
            return;
        }

        // 2. 仅是文件名或相对路径：尝试从当前库读取为 base64 并转成 data-url
        if (/\.(png|jpe?g|gif|webp|svg)/i.test(imageStr)) {
            (async () => {
                try {
					let nc = (this.app as any).plugins.plugins['note-chain'];
					let src = await nc.easyapi.file.read_binary_to_base64(imageStr);
                    const img = el.createEl("img", { attr: { src } });
                    if (style) Object.assign(img.style, style);
                } catch (e) {
                    // 读取失败时退回到默认图标，而不是抛错
                    setIcon(el, isFolder ? "folder" : "file-text");
                }
            })();
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

    private arrayBufferToBase64(buffer: ArrayBuffer): string {
        let binary = "";
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    private guessImageMimeType(path: string): string {
        const lower = path.toLowerCase();
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".gif")) return "image/gif";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        return "image/png";
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
            if (item.action) await item.action(item);
            if (this.resolveResult) this.resolveResult(item);
            this.close();
        }
    }

    onClose() {
        if (!this.resolved && this.resolveResult) this.resolveResult(null);
        this.contentEl.empty();
    }
}

export async function openCardNavigator(app: App, data: CardItem[], options?: CardNavigatorOptions) {
    return new CardNavigatorModal(app, data, options).openAndWait();
}