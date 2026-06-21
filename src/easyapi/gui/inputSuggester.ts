import { FuzzySuggestModal, prepareSimpleSearch } from "obsidian";
import type { FuzzyMatch, App } from "obsidian";

/** 超过此数量时启用快速搜索路径并设置默认 limit */
const LARGE_LIST_THRESHOLD = 500;
const DEFAULT_LARGE_LIMIT = 100;

type SearchEntry = { item: string; text: string };

// 添加类型声明
interface SuggesterChooser {
	values: {
		item: string;
		match: { score: number; matches: unknown[] };
	}[];
	selectedItem: number;
	[key: string]: unknown;
}

// 扩展FuzzySuggestModal的类型
interface ExtendedFuzzySuggestModal extends FuzzySuggestModal<string> {
	chooser: SuggesterChooser;
}

type Options = {
	limit: FuzzySuggestModal<string>["limit"];
	emptyStateText: FuzzySuggestModal<string>["emptyStateText"];
	placeholder: Parameters<
		FuzzySuggestModal<string>["setPlaceholder"]
	>[0] extends string
		? string
		: never;
};

/**
 * Copy from QuickAdd
 */
export default class InputSuggester extends FuzzySuggestModal<string> {
	private resolvePromise: (value: string) => void;
	private rejectPromise: (reason?: unknown) => void;
	public promise: Promise<string>;
	private resolved: boolean;
	public new_value: boolean;
	inputEl: any;
	/** item → 展示文本；与 items 相同时为 null，getItemText 直接返回 item */
	private readonly itemDisplay: Map<string, string> | null;
	private readonly searchEntries: SearchEntry[];

	public static Suggest(
		app: App,
		displayItems: string[],
		items: string[],
		options: Partial<Options> = {},
		new_value:boolean=false
	) {
		const newSuggester = new InputSuggester(
			app,
			displayItems,
			items,
			options,
			new_value
		);
		return newSuggester.promise;
	}

	public constructor(
		app: App,
		displayItems: string[],
		private items: string[],
		options: Partial<Options> = {},
		new_value: boolean = false
	) {
		super(app);
		this.new_value = new_value;

		const n = Math.min(displayItems.length, items.length);
		const entries: SearchEntry[] = [];
		let needsDisplayMap = false;
		for (let i = 0; i < n; i++) {
			if (displayItems[i] !== items[i]) needsDisplayMap = true;
			entries.push({ item: items[i], text: displayItems[i] });
		}
		for (let i = n; i < items.length; i++) {
			entries.push({ item: items[i], text: String(items[i]) });
			needsDisplayMap = true;
		}
		this.searchEntries = entries;
		if (needsDisplayMap) {
			const map = new Map<string, string>();
			for (const { item, text } of entries) {
				if (!map.has(item)) map.set(item, text);
			}
			this.itemDisplay = map;
		} else {
			this.itemDisplay = null;
		}

		this.promise = new Promise<string>((resolve, reject) => {
			this.resolvePromise = resolve;
			this.rejectPromise = reject;
		});

		this.inputEl.addEventListener("keydown", (event: KeyboardEvent) => {
			if (event.code !== "Tab") {
				return;
			}

			// 使用类型断言来访问chooser
			const self = this as unknown as ExtendedFuzzySuggestModal;
			const { values, selectedItem } = self.chooser;

			const { value } = this.inputEl;
			this.inputEl.value = values[selectedItem].item ?? value;
		});

		if (options.placeholder) this.setPlaceholder(options.placeholder);
		if (options.limit) this.limit = options.limit;
		else if (this.searchEntries.length > LARGE_LIST_THRESHOLD) {
			this.limit = DEFAULT_LARGE_LIMIT;
		}
		if (options.emptyStateText)
			this.emptyStateText = options.emptyStateText;

		this.open();
	}

	getItemText(item: string): string {
		if (item === this.inputEl.value) return item;
		if (this.itemDisplay === null) return item;
		return this.itemDisplay.get(item) ?? item;
	}

	getItems(): string[] {
		if (this.inputEl.value === "" || !this.new_value) return this.items;
		return [...this.items, this.inputEl.value];
	}

	getSuggestions(query: string): FuzzyMatch<string>[] {
		const pool = this.getSearchPool();
		const cap = this.limit > 0 ? this.limit : DEFAULT_LARGE_LIMIT;
		const trimmed = query.trim();

		if (!trimmed) {
			return pool.slice(0, cap).map((entry) => ({
				item: entry.item,
				match: { score: 0, matches: [] },
			}));
		}

		const searchFn = prepareSimpleSearch(trimmed);
		const scored: FuzzyMatch<string>[] = [];
		for (const { item, text } of pool) {
			const match = searchFn(text);
			if (match) scored.push({ item, match });
		}
		scored.sort((a, b) => b.match.score - a.match.score);
		return scored.slice(0, cap);
	}

	private getSearchPool(): SearchEntry[] {
		if (this.inputEl.value === "" || !this.new_value) {
			return this.searchEntries;
		}
		const value = this.inputEl.value;
		return [...this.searchEntries, { item: value, text: value }];
	}

	selectSuggestion(
		value: FuzzyMatch<string>,
		evt: MouseEvent | KeyboardEvent
	) {
		this.resolved = true;
		super.selectSuggestion(value, evt);
	}

	onChooseItem(item: string, evt: MouseEvent | KeyboardEvent): void {
		this.resolved = true;
		this.resolvePromise(item);
	}

	onClose() {
		super.onClose();
		if (!this.resolved) this.rejectPromise("no input given.");
	}
}

export async function dialog_suggest(displayItems:Array<string>,items:Array<any>,placeholder='',new_value=false) {
	try{
		return await InputSuggester.Suggest(
			this.app,
			displayItems,
			items,
			{
				placeholder: placeholder,
			},
			new_value
		)
	}catch(error){
		
		return null
	}
	
}
