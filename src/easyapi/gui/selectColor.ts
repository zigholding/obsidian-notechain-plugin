import type { App } from "obsidian";
import { ButtonComponent, Modal } from "obsidian";

/** Coerce a frontmatter or CSS-ish string to `#rrggbb` for `<input type="color">`. */
export function normalizeHexForColorInput(v: unknown): string {
	if (typeof v !== "string") return "#888888";
	const s = v.trim();
	if (/^#[\da-fA-F]{6}$/.test(s)) return s.toLowerCase();
	if (/^#[\da-fA-F]{3}$/.test(s)) {
		return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
	}
	return "#888888";
}

/** Modal color picker; same Promise / Ok–Cancel pattern as InputPrompt. */
export default class SelectColor extends Modal {
	public waitForClose: Promise<string>;

	private resolvePromise: (color: string) => void;
	private rejectPromise: (reason?: unknown) => void;
	private didSubmit = false;
	private color: string;
	private colorInputEl!: HTMLInputElement;

	public static Prompt(app: App, header: string, initial?: unknown): Promise<string> {
		const modal = new SelectColor(app, header, initial);
		return modal.waitForClose;
	}

	protected constructor(
		app: App,
		private header: string,
		initial?: unknown
	) {
		super(app);
		this.color = normalizeHexForColorInput(initial);

		this.waitForClose = new Promise<string>((resolve, reject) => {
			this.resolvePromise = resolve;
			this.rejectPromise = reject;
		});

		this.display();
		this.open();
	}

	private display() {
		this.containerEl.addClass("ncSelectColorModal");
		this.contentEl.empty();
		this.titleEl.textContent = this.header;

		const mainContentContainer = this.contentEl.createDiv();
		this.colorInputEl = mainContentContainer.createEl("input", { type: "color" });
		this.colorInputEl.value = this.color;
		this.colorInputEl.addEventListener("input", () => {
			this.color = this.colorInputEl.value;
		});

		const buttonBarContainer = mainContentContainer.createDiv();
		buttonBarContainer.classList.add("button-bar");

		new ButtonComponent(buttonBarContainer)
			.setButtonText("Ok")
			.setCta()
			.onClick(() => this.submit());
		new ButtonComponent(buttonBarContainer)
			.setButtonText("Cancel")
			.onClick(() => this.cancel());
	}

	private submit() {
		this.color = this.colorInputEl.value;
		this.didSubmit = true;
		this.close();
	}

	private cancel() {
		this.close();
	}

	private resolveOutcome() {
		if (!this.didSubmit) this.rejectPromise("No color selected.");
		else this.resolvePromise(this.color);
	}

	onOpen() {
		super.onOpen();
		this.colorInputEl?.focus();
	}

	onClose() {
		super.onClose();
		this.resolveOutcome();
	}
}

export async function selectColor(
	header: string,
	initial?: unknown
): Promise<string | null> {
	try {
		return await SelectColor.Prompt(this.app, header, initial);
	} catch {
		return null;
	}
}
