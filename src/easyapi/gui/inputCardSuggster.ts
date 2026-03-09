import { App, Modal } from "obsidian";

/**
 * 单个卡片的数据结构
 *
 * - 如果 `func` 是数组：表示这是一个“文件夹”，点击后进入子级
 * - 如果 `func` 是函数：表示这是一个“可执行项”，点击后会：
 *   1) 关闭 Modal
 *   2) 返回当前对象
 *   3) 同时调用该函数（如果存在）
 */
export interface CardItem {
	name: string;
	detail?: string;
	image?: string;
	func?: CardItem[] | ((item: CardItem) => void | Promise<void>);
	// 允许用户自定义其它字段
	[key: string]: any;
}

export interface CardNavigatorOptions {
	perRow?: number;
	maxHeight?: number;
	searchPlaceholder?: string;
	homeText?: string;
	backText?: string;
}

let DEFAULT_OPTIONS: Required<CardNavigatorOptions> = {
	perRow: 4,
	maxHeight: 600,
	searchPlaceholder: "🔍 搜索...",
	homeText: "🏠 返回根目录",
	backText: "⬅ 返回上一级",
};

function formatImage(image: CardItem["image"]): string {
	if (!image) return "⚡";
	if (typeof image === "string") {
		if (image.startsWith("http")) {
			return `<img src="${image}" />`;
		}else if(image.startsWith("data:image/png;base64,")){
			return `<img src="${image}" />`;
		}else{
			return image;
		}
	}
	return "⚡";
}

/**
 * 基于 Obsidian Modal 的层次卡片选择器
 */
export class CardNavigatorModal extends Modal {
	private rootData: CardItem[];
	private options: Required<CardNavigatorOptions>;

	private currentItems: CardItem[];
	private navigationStack: CardItem[][] = [];

	private resolveResult: ((item: CardItem | null) => void) | null = null;
	private resolved = false;

	constructor(app: App, data: CardItem[], options: CardNavigatorOptions = {}) {
		super(app);
		this.rootData = data;
		this.currentItems = data;
		this.options = { ...DEFAULT_OPTIONS, ...options };
	}

	/**
	 * 打开 Modal，并在用户选择后返回选中的 CardItem
	 */
	openAndWait(): Promise<CardItem | null> {
		this.open();
		return new Promise<CardItem | null>((resolve) => {
			this.resolveResult = resolve;
		});
	}

	onOpen(): void {
		this.modalEl.addClass("note-chain-card-suggester-modal");
		this.renderUI(this.currentItems, false);
	}

	onClose(): void {
		if (!this.resolved && this.resolveResult) {
			this.resolveResult(null);
		}
		this.contentEl.empty();
	}

	private makeButton(item: CardItem, index: number): string {
		return `
			<div class="nc-card-btn" data-index="${index}">
				<div class="nc-card-cover">${formatImage(item.image)}</div>
				<div class="nc-card-name">${item.name}</div>
				${item.detail ? `<div class="nc-card-detail">${item.detail}</div>` : ""}
			</div>
		`;
	}

	private renderFolder(items: CardItem[]): string {
		return items.map((item, index) => this.makeButton(item, index)).join("");
	}

	private renderUI(items: CardItem[], canGoBack: boolean): void {
		let { perRow, maxHeight, searchPlaceholder, homeText, backText } =
			this.options;

		let backBtn = "";
		if (canGoBack) {
			backBtn = `<div class="nc-card-back">${backText}</div>`;
		}

		this.contentEl.empty();

		this.contentEl.innerHTML = `
			<div class="nc-card-topbar">
				<div class="nc-card-search">
					<input type="text" placeholder="${searchPlaceholder}" class="nc-card-search-input"/>
				</div>
				<div class="nc-card-home">${homeText}</div>
			</div>
			${backBtn}
			<div class="nc-card-nav" style="max-height: ${maxHeight}px;">
				<div class="nc-card-container" style="--per-row:${perRow}">
					${this.renderFolder(items)}
				</div>
			</div>
		`;

		this.bindEvents(items, canGoBack);
	}

	private bindEvents(items: CardItem[], canGoBack: boolean): void {
		let nav = this.contentEl.querySelector(
			".nc-card-nav",
		) as HTMLDivElement | null;
		if (!nav) return;

		// 点击卡片
		nav.querySelectorAll<HTMLDivElement>(".nc-card-btn").forEach((btn) => {
			btn.onclick = () => {
				let indexAttr = btn.getAttribute("data-index");
				if (indexAttr == null) return;
				let index = parseInt(indexAttr, 10);
				let item = items[index];
				if (!item) return;

				if (Array.isArray(item.func)) {
					// 文件夹：进入子级
					this.navigationStack.push(items);
					this.currentItems = item.func;
					this.renderUI(this.currentItems, true);
				} else {
					// 叶子：执行函数（如果有），关闭 modal 并返回对象
					void this.handleLeafClick(item);
				}
			};
		});

		// 返回上一级
		let backBtn = this.contentEl.querySelector(
			".nc-card-back",
		) as HTMLDivElement | null;
		if (backBtn && canGoBack) {
			backBtn.onclick = () => {
				let parentItems = this.navigationStack.pop();
				if (parentItems) {
					this.currentItems = parentItems;
					this.renderUI(this.currentItems, this.navigationStack.length > 0);
				} else {
					this.currentItems = this.rootData;
					this.renderUI(this.currentItems, false);
				}
			};
		}

		// 返回根目录
		let homeBtn = this.contentEl.querySelector(
			".nc-card-home",
		) as HTMLDivElement | null;
		if (homeBtn) {
			homeBtn.onclick = () => {
				this.navigationStack = [];
				this.currentItems = this.rootData;
				this.renderUI(this.currentItems, false);
			};
		}

		// 搜索
		let searchInput = this.contentEl.querySelector(
			".nc-card-search-input",
		) as HTMLInputElement | null;
		if (searchInput) {
			searchInput.addEventListener("input", (e) => {
				let target = e.target as HTMLInputElement;
				let keyword = target.value.trim().toLowerCase();
				if (keyword === "") {
					this.renderUI(this.currentItems, canGoBack);
				} else {
					let filteredItems = this.searchItems(this.rootData, keyword);
					if (!nav) return;
					nav.innerHTML = `<div class="nc-card-container" style="--per-row:${this.options.perRow}">${this.renderFolder(
						filteredItems,
					)}</div>`;
					this.bindSearchEvents(filteredItems);
				}
			});
		}
	}

	private bindSearchEvents(items: CardItem[]): void {
		let nav = this.contentEl.querySelector(
			".nc-card-nav",
		) as HTMLDivElement | null;
		if (!nav) return;

		nav.querySelectorAll<HTMLDivElement>(".nc-card-btn").forEach((btn) => {
			btn.onclick = () => {
				let indexAttr = btn.getAttribute("data-index");
				if (indexAttr == null) return;
				let index = parseInt(indexAttr, 10);
				let item = items[index];
				if (!item) return;

				if (Array.isArray(item.func)) {
					this.navigationStack = [];
					this.currentItems = item.func;
					this.renderUI(this.currentItems, true);
				} else {
					void this.handleLeafClick(item);
				}
			};
		});
	}

	private searchItems(items: CardItem[], keyword: string): CardItem[] {
		let results: CardItem[] = [];

		function searchRecursive(list: CardItem[], path: string[] = []) {
			for (let item of list) {
				let nameMatch = item.name.toLowerCase().includes(keyword);
				let detailMatch =
					item.detail && item.detail.toLowerCase().includes(keyword);
				if (nameMatch || detailMatch) {
					results.push({
						...item,
						path: [...path, item.name],
					});
				}
				if (Array.isArray(item.func)) {
					searchRecursive(item.func, [...path, item.name]);
				}
			}
		}

		searchRecursive(items);
		return results;
	}

	private async handleLeafClick(item: CardItem): Promise<void> {
		try {
			if (typeof item.func === "function") {
				await item.func(item);
			}
		} finally {
			this.resolved = true;
			if (this.resolveResult) {
				this.resolveResult(item);
			}
			this.close();
		}
	}
}

/**
 * 便捷函数：
 * 打开卡片选择器，返回用户点击的对象
 */
export async function openCardNavigator(
	app: App,
	data: CardItem[],
	options: CardNavigatorOptions = {},
): Promise<CardItem | null> {
	let modal = new CardNavigatorModal(app, data, options);
	return await modal.openAndWait();
}


