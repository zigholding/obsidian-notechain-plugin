import type { App, SearchResult } from "obsidian";
import {
	ButtonComponent,
	Modal,
	prepareSimpleSearch,
	renderMatches,
	setIcon,
} from "obsidian";

type Options<T = string> = {
	placeholder?: string;
	title?: string;
	/** 已选区域为空时的提示 */
	emptySelectedText?: string;
	/** 待选区域无匹配时的提示 */
	emptyCandidateText?: string;
	/** 待选列表最大条数，与 FuzzySuggestModal.limit 类似 */
	limit?: number;
};

/**
 * 多选模糊建议弹窗：与 InputSuggester 相同，使用平行的 displayItems / items。
 * 布局自上而下：搜索框、已选列表、待选列表。确认时仅返回选中的 items[]（顺序与已选列表一致）。
 */
export default class InputMultiSuggester<T = string> extends Modal {
	private resolvePromise!: (value: T[]) => void;
	private rejectPromise!: (reason?: unknown) => void;
	public promise: Promise<T[]>;
	private resolved = false;

	private readonly displayItems: string[];
	private readonly items: T[];
	private readonly allIndices: number[];
	private readonly selectedSet = new Set<number>();
	/** 选中顺序，用于顶部列表与返回值顺序 */
	private selectedOrder: number[] = [];

	private searchInput!: HTMLInputElement;
	private selectedContainer!: HTMLElement;
	private candidateContainer!: HTMLElement;

	public static open<U>(
		app: App,
		displayItems: string[],
		items: U[],
		options: Options<U> = {},
	): Promise<U[]> {
		const modal = new InputMultiSuggester(app, displayItems, items, options);
		modal.open();
		return modal.promise;
	}

	constructor(
		app: App,
		displayItems: string[],
		items: T[],
		private options: Options<T> = {},
	) {
		super(app);
		const n = Math.min(displayItems.length, items.length);
		this.displayItems = displayItems.slice(0, n);
		this.items = items.slice(0, n) as T[];
		this.allIndices = Array.from({ length: n }, (_, i) => i);

		this.promise = new Promise<T[]>((resolve, reject) => {
			this.resolvePromise = resolve;
			this.rejectPromise = reject;
		});
	}

	onOpen(): void {
		super.onOpen();
		this.modalEl.addClass("nc-multi-suggest-modal");
		this.titleEl.setText(this.options.title ?? "");

		const root = this.contentEl.createDiv({ cls: "nc-multi-suggest-root" });

		this.searchInput = root.createEl("input", {
			type: "text",
			cls: "nc-multi-suggest-search",
			attr: {
				placeholder: this.options.placeholder ?? "",
			},
		});
		this.searchInput.addEventListener("input", () => this.refreshLists());
		this.searchInput.addEventListener("keydown", (e) => {
			if (e.key === "Escape") {
				e.stopPropagation();
			}
		});

		root.createDiv({ cls: "nc-multi-suggest-section-title", text: "已选" });
		this.selectedContainer = root.createDiv({
			cls: "nc-multi-suggest-list nc-multi-suggest-selected",
		});

		root.createDiv({ cls: "nc-multi-suggest-section-title", text: "待选" });
		this.candidateContainer = root.createDiv({
			cls: "nc-multi-suggest-list nc-multi-suggest-candidates",
		});

		const bar = root.createDiv({ cls: "nc-multi-suggest-actions" });
		new ButtonComponent(bar)
			.setButtonText("确定")
			.setCta()
			.onClick(() => this.confirm());
		new ButtonComponent(bar).setButtonText("取消").onClick(() => this.close());

		this.refreshLists();
		this.searchInput.focus();
	}

	private static readonly DND_TYPE = "application/x-note-chain-multi-suggest-pos";

	/** 在「当前列表下标」空间中移动一项：与先 splice(from) 再 splice(to) 插入一致 */
	private reorderSelectedByListIndex(from: number, to: number): void {
		if (from === to || from < 0 || to < 0) return;
		if (from >= this.selectedOrder.length || to >= this.selectedOrder.length) return;
		const next = [...this.selectedOrder];
		const [item] = next.splice(from, 1);
		next.splice(to, 0, item);
		this.selectedOrder = next;
	}

	private attachSelectedDragDrop(rows: HTMLElement[]): void {
		if (rows.length < 2) return;
		const onDragOver = (e: DragEvent) => {
			e.preventDefault();
			e.dataTransfer!.dropEffect = "move";
		};
		const clearDragClass = () => {
			for (const r of rows) r.removeClass("nc-multi-suggest-row-dnd-over");
		};
		for (const row of rows) {
			row.addEventListener("dragover", onDragOver);
			row.addEventListener("dragenter", () => {
				clearDragClass();
				row.addClass("nc-multi-suggest-row-dnd-over");
			});
			row.addEventListener("dragleave", (e) => {
				if (!row.contains(e.relatedTarget as Node)) {
					row.removeClass("nc-multi-suggest-row-dnd-over");
				}
			});
			row.addEventListener("drop", (e: DragEvent) => {
				e.preventDefault();
				clearDragClass();
				const dt = e.dataTransfer;
				const raw =
					dt?.getData(InputMultiSuggester.DND_TYPE) ||
					dt?.getData("text/plain");
				if (raw === undefined || raw === "") return;
				const from = parseInt(raw, 10);
				const to = rows.indexOf(row);
				if (Number.isNaN(from) || to < 0) return;
				this.reorderSelectedByListIndex(from, to);
				this.refreshLists();
			});
		}
	}

	private getFilteredCandidateIndices(): number[] {
		const pool = this.allIndices.filter((i) => !this.selectedSet.has(i));
		const q = this.searchInput?.value?.trim() ?? "";
		if (!q) {
			return pool;
		}
		const searchFn = prepareSimpleSearch(q);
		const scored: { i: number; score: number; match: SearchResult }[] = [];
		for (const i of pool) {
			const m = searchFn(this.displayItems[i]);
			if (m) scored.push({ i, score: m.score, match: m });
		}
		scored.sort((a, b) => b.score - a.score);
		let ordered = scored.map((s) => s.i);
		const lim = this.options.limit;
		if (lim != null && lim > 0) ordered = ordered.slice(0, lim);
		return ordered;
	}

	private getMatchForCandidate(index: number, query: string): SearchResult | null {
		const q = query.trim();
		if (!q) return null;
		return prepareSimpleSearch(q)(this.displayItems[index]);
	}

	private refreshLists(): void {
		const query = this.searchInput?.value ?? "";

		this.selectedContainer.empty();
		if (this.selectedOrder.length === 0) {
			this.selectedContainer.createDiv({
				cls: "nc-multi-suggest-empty",
				text: this.options.emptySelectedText ?? "（未选择）",
			});
		} else {
			const rowEls: HTMLElement[] = [];
			for (let listPos = 0; listPos < this.selectedOrder.length; listPos++) {
				const idx = this.selectedOrder[listPos];
				const row = this.selectedContainer.createDiv({
					cls: "nc-multi-suggest-row nc-multi-suggest-row-selected",
					attr: { "data-nc-item-index": String(idx) },
				});
				rowEls.push(row);
				const handle = row.createDiv({
					cls: "nc-multi-suggest-drag-handle",
					attr: { title: "拖动排序", draggable: "true" },
				});
				setIcon(handle, "grip-vertical");
				handle.addEventListener("dragstart", (e: DragEvent) => {
					const dt = e.dataTransfer!;
					dt.effectAllowed = "move";
					const pos = String(listPos);
					dt.setData(InputMultiSuggester.DND_TYPE, pos);
					dt.setData("text/plain", pos);
					row.addClass("nc-multi-suggest-row-dragging");
				});
				handle.addEventListener("dragend", () => {
					row.removeClass("nc-multi-suggest-row-dragging");
					for (const r of rowEls) r.removeClass("nc-multi-suggest-row-dnd-over");
				});
				const label = row.createDiv({ cls: "nc-multi-suggest-row-label" });
				label.setText(this.displayItems[idx]);
				const removeBtn = row.createDiv({
					cls: "nc-multi-suggest-row-action",
					attr: { title: "移除" },
				});
				setIcon(removeBtn, "cross");
				removeBtn.addEventListener("click", (ev: MouseEvent) => {
					ev.stopPropagation();
					this.toggleSelected(idx, false);
				});
			}
			this.attachSelectedDragDrop(rowEls);
		}

		this.candidateContainer.empty();
		const candidates = this.getFilteredCandidateIndices();
		if (candidates.length === 0) {
			this.candidateContainer.createDiv({
				cls: "nc-multi-suggest-empty",
				text: this.options.emptyCandidateText ?? "无匹配项",
			});
		} else {
			for (const idx of candidates) {
				const row = this.candidateContainer.createDiv({
					cls: "nc-multi-suggest-row nc-multi-suggest-row-candidate",
				});
				const label = row.createDiv({ cls: "nc-multi-suggest-row-label" });
				const text = this.displayItems[idx];
				const match = this.getMatchForCandidate(idx, query);
				label.empty();
				renderMatches(label, text, match?.matches ?? null);
				row.addEventListener("click", () => this.toggleSelected(idx, true));
			}
		}
	}

	private toggleSelected(index: number, select: boolean): void {
		if (select) {
			if (this.selectedSet.has(index)) return;
			this.selectedSet.add(index);
			this.selectedOrder.push(index);
		} else {
			if (!this.selectedSet.has(index)) return;
			this.selectedSet.delete(index);
			this.selectedOrder = this.selectedOrder.filter((i) => i !== index);
		}
		this.refreshLists();
	}

	private confirm(): void {
		this.resolved = true;
		const vals = this.selectedOrder.map((i) => this.items[i]);
		this.resolvePromise(vals);
		this.close();
	}

	onClose(): void {
		super.onClose();
		if (!this.resolved) {
			this.rejectPromise("no input given.");
		}
		this.contentEl.empty();
	}
}

export async function dialog_multi_suggest<T = string>(
	displayItems: string[],
	items: T[],
	placeholder = "",
	title = "",
): Promise<T[] | null> {
	try {
		let res = await InputMultiSuggester.open(
			(this as { app: App }).app,
			displayItems,
			items,
			{ placeholder, title },
		);
		if(res && res.length > 0){
			return res;
		}
		return null;
	} catch {
		return null;
	}
}
