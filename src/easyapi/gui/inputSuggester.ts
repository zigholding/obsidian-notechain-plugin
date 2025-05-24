import { FuzzySuggestModal } from "obsidian";
import type { FuzzyMatch , App} from "obsidian";

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
	inputEl: any;

	public static Suggest(
		app: App,
		displayItems: string[],
		items: string[],
		options: Partial<Options> = {}
	) {
		const newSuggester = new InputSuggester(
			app,
			displayItems,
			items,
			options
		);
		return newSuggester.promise;
	}

	public constructor(
		app: App,
		private displayItems: string[],
		private items: string[],
		options: Partial<Options> = {}
	) {
		super(app);

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
		if (options.emptyStateText)
			this.emptyStateText = options.emptyStateText;

		this.open();
	}

	getItemText(item: string): string {
		if (item === this.inputEl.value) return item;

		return this.displayItems[this.items.indexOf(item)];
	}

	getItems(): string[] {
		if (this.inputEl.value === "") return this.items;
		return [this.inputEl.value, ...this.items];
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

export async function dialog_suggest(displayItems:Array<string>,items:Array<any>,placeholder='') {
	try{
		return await InputSuggester.Suggest(
			this.app,
			displayItems,
			items,
			{
				placeholder: placeholder,
			}
		)
	}catch(error){
		
		return null
	}
	
}
