import type { App } from "obsidian";
import {
	ButtonComponent,
	Modal,
	TFile,
	TextComponent
} from "obsidian";

/**
 * Copy from QuickAdd
 */

export default class InputPrompt extends Modal {
	public waitForClose: Promise<string>;

	private resolvePromise: (input: string) => void;
	private rejectPromise: (reason?: unknown) => void;
	private didSubmit = false;
	private inputComponent: TextComponent;
	private input: string;
	private readonly placeholder: string;
	private allNoteNames: string[] = [];
	private linkSuggestions: string[] = [];
	private selectedSuggestionIndex = 0;
	private linkTriggerStart = -1;
	private suggestionContainerEl: HTMLDivElement | null = null;
	private readonly updateSuggestionPosition = () => this.positionSuggestionList();

	public static Prompt(
		app: App,
		header: string,
		placeholder?: string,
		value?: string
	): Promise<string> {
		const newPromptModal = new InputPrompt(
			app,
			header,
			placeholder,
			value
		);
		return newPromptModal.waitForClose;
	}

	protected constructor(
		app: App,
		private header: string,
		placeholder?: string,
		value?: string
	) {
		super(app);
		this.placeholder = placeholder ?? "";
		this.input = value ?? "";

		this.waitForClose = new Promise<string>((resolve, reject) => {
			this.resolvePromise = resolve;
			this.rejectPromise = reject;
		});

		this.display();
		this.open();

	}

	private display() {
		this.containerEl.addClass("quickAddModal", "qaInputPrompt");
		this.contentEl.empty();
		this.titleEl.textContent = this.header;

		const mainContentContainer: HTMLDivElement = this.contentEl.createDiv({
			cls: "qa-input-main"
		});
		const inputWrap = mainContentContainer.createDiv({
			cls: "qa-input-wrap"
		});
		this.inputComponent = this.createInputField(
			inputWrap,
			this.placeholder,
			this.input
		);
		this.suggestionContainerEl = inputWrap.createDiv({
			cls: "qa-inline-suggest"
		});
		this.createButtonBar(mainContentContainer);
		this.cacheNoteNames();
	}

	protected createInputField(
		container: HTMLElement,
		placeholder?: string,
		value?: string
	) {
		const textComponent = new TextComponent(container);
		textComponent.inputEl.classList.add("input-field", "qa-input-field");
		textComponent.inputEl.style.width = "100%";
		(textComponent as any)
			.setPlaceholder(placeholder ?? "")
			.setValue(value ?? "")
			.onChange((value:string) => (this.input = value))
			.inputEl.addEventListener("keydown", this.submitEnterCallback);
		textComponent.inputEl.addEventListener("input", this.linkSuggestCallback);
		textComponent.inputEl.addEventListener("click", this.linkSuggestCallback);

		return textComponent;
	}

	private createButton(
		container: HTMLElement,
		text: string,
		callback: (evt: MouseEvent) => unknown
	) {
		const btn = new ButtonComponent(container);
		btn.setButtonText(text).onClick(callback);

		return btn;
	}

	private createButtonBar(mainContentContainer: HTMLDivElement) {
		const buttonBarContainer: HTMLDivElement =
			mainContentContainer.createDiv();
		this.createButton(
			buttonBarContainer,
			"Ok",
			this.submitClickCallback
		).setCta().buttonEl.style.marginRight = "0";
		this.createButton(
			buttonBarContainer,
			"Cancel",
			this.cancelClickCallback
		);

		buttonBarContainer.classList.add("button-bar");
		
	}

	private submitClickCallback = (evt: MouseEvent) => this.submit();
	private cancelClickCallback = (evt: MouseEvent) => this.cancel();

	private submitEnterCallback = (evt: KeyboardEvent) => {
		if (this.linkSuggestions.length > 0) {
			if (evt.key === "ArrowDown") {
				evt.preventDefault();
				this.moveSuggestionSelection(1);
				return;
			}
			if (evt.key === "ArrowUp") {
				evt.preventDefault();
				this.moveSuggestionSelection(-1);
				return;
			}
			if (evt.key === "Enter" || evt.key === "Tab") {
				evt.preventDefault();
				this.applySuggestion(this.selectedSuggestionIndex);
				return;
			}
			if (evt.key === "Escape") {
				evt.preventDefault();
				this.closeSuggestionList();
				return;
			}
		}

		if (!evt.isComposing && evt.key === "Enter") {
			evt.preventDefault();
			this.submit();
		}
	};

	private cacheNoteNames() {
		this.allNoteNames = this.app.vault
			.getMarkdownFiles()
			.sort((a: TFile, b: TFile) => a.basename.localeCompare(b.basename))
			.map((file: TFile) => file.basename);
	}

	private linkSuggestCallback = () => {
		this.updateInlineSuggestions();
	};

	private updateInlineSuggestions() {
		const inputEl = this.inputComponent.inputEl;
		const cursor = inputEl.selectionStart ?? inputEl.value.length;
		const textBeforeCursor = inputEl.value.slice(0, cursor);
		const match = textBeforeCursor.match(/\[\[([^\]\n]*)$/);
		if (!match) {
			this.closeSuggestionList();
			return;
		}

		const query = (match[1] ?? "").trim().toLowerCase();
		this.linkTriggerStart = cursor - match[0].length;
		const candidates = this.allNoteNames.filter((name) =>
			query.length === 0 ? true : name.toLowerCase().includes(query)
		);
		this.linkSuggestions = candidates.slice(0, 12);
		this.selectedSuggestionIndex = 0;
		this.renderSuggestionList();
	}

	private renderSuggestionList() {
		if (!this.suggestionContainerEl) return;
		this.suggestionContainerEl.empty();
		if (this.linkSuggestions.length === 0) {
			this.closeSuggestionList();
			return;
		}
		this.suggestionContainerEl.addClass("is-open");
		window.addEventListener("resize", this.updateSuggestionPosition);
		window.addEventListener("scroll", this.updateSuggestionPosition, true);
		this.positionSuggestionList();

		this.linkSuggestions.forEach((name, index) => {
			const itemEl = this.suggestionContainerEl!.createDiv({
				cls: `qa-inline-suggest-item ${index === this.selectedSuggestionIndex ? "is-selected" : ""}`,
				text: name
			});
			itemEl.addEventListener("mousedown", (evt) => {
				evt.preventDefault();
				this.applySuggestion(index);
			});
		});
	}

	private moveSuggestionSelection(step: number) {
		if (!this.linkSuggestions.length) return;
		const size = this.linkSuggestions.length;
		this.selectedSuggestionIndex =
			((this.selectedSuggestionIndex + step) % size + size) % size;
		this.renderSuggestionList();
	}

	private applySuggestion(index: number) {
		const selected = this.linkSuggestions[index];
		if (!selected) return;
		const inputEl = this.inputComponent.inputEl;
		const cursor = inputEl.selectionStart ?? inputEl.value.length;
		const before = inputEl.value.slice(0, this.linkTriggerStart);
		const after = inputEl.value.slice(cursor);
		const inserted = `[[${selected}]]`;
		inputEl.value = `${before}${inserted}${after}`;
		this.input = inputEl.value;
		const nextCursor = before.length + inserted.length;
		inputEl.setSelectionRange(nextCursor, nextCursor);
		inputEl.focus();
		this.closeSuggestionList();
	}

	private positionSuggestionList() {
		if (!this.suggestionContainerEl || this.linkSuggestions.length === 0) return;
		const inputRect = this.inputComponent.inputEl.getBoundingClientRect();
		const viewportPadding = 8;
		const gap = 6;
		const spaceBelow = window.innerHeight - inputRect.bottom - viewportPadding;
		const spaceAbove = inputRect.top - viewportPadding;
		const preferAbove = spaceBelow < 180 && spaceAbove > spaceBelow;
		const available = preferAbove ? spaceAbove : spaceBelow;
		const maxHeight = Math.max(120, Math.min(360, available - gap));
		const top = preferAbove
			? Math.max(viewportPadding, inputRect.top - maxHeight - gap)
			: inputRect.bottom + gap;

		const elStyle = this.suggestionContainerEl.style;
		elStyle.left = `${inputRect.left}px`;
		elStyle.top = `${top}px`;
		elStyle.width = `${inputRect.width}px`;
		elStyle.maxHeight = `${maxHeight}px`;
		elStyle.position = "fixed";
	}

	private closeSuggestionList() {
		this.linkSuggestions = [];
		this.selectedSuggestionIndex = 0;
		this.linkTriggerStart = -1;
		if (!this.suggestionContainerEl) return;
		window.removeEventListener("resize", this.updateSuggestionPosition);
		window.removeEventListener("scroll", this.updateSuggestionPosition, true);
		this.suggestionContainerEl.empty();
		this.suggestionContainerEl.removeClass("is-open");
	}

	private submit() {
		this.didSubmit = true;

		this.close();
	}

	private cancel() {
		this.close();
	}

	private resolveInput() {
		if (!this.didSubmit) this.rejectPromise("No input given.");
		else this.resolvePromise(this.input);
	}

	private removeInputListener() {
		this.inputComponent.inputEl.removeEventListener(
			"keydown",
			this.submitEnterCallback
		);
		this.inputComponent.inputEl.removeEventListener(
			"input",
			this.linkSuggestCallback
		);
		this.inputComponent.inputEl.removeEventListener(
			"click",
			this.linkSuggestCallback
		);
		this.closeSuggestionList();
	}

	onOpen() {
		super.onOpen();

		this.inputComponent.inputEl.focus();
		this.inputComponent.inputEl.select();
	}

	onClose() {
		super.onClose();
		this.resolveInput();
		this.removeInputListener();
	}
}


export async function dialog_prompt(header: string='Input', placeholder: string='',value:string='') {
	try{
		return await InputPrompt.Prompt(
			this.app,
			header,
			placeholder,
            value
		)
	}catch{
		return null
	}
}
