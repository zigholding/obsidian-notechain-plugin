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

/** Normalize a list of palette entries to unique `#rrggbb` values (order preserved). */
export function normalizePaletteInput(colors: unknown): string[] {
	if (!Array.isArray(colors)) return [];
	const seen = new Set<string>();
	const out: string[] = [];
	for (const c of colors) {
		const h = normalizeHexForColorInput(c);
		if (seen.has(h)) continue;
		seen.add(h);
		out.push(h);
	}
	return out;
}

/** Modal color picker; same Promise / Ok–Cancel pattern as InputPrompt. */
export default class SelectColor extends Modal {
	public waitForClose: Promise<string>;

	private resolvePromise: (color: string) => void;
	private rejectPromise: (reason?: unknown) => void;
	private didSubmit = false;
	private color: string;
	private colorInputEl!: HTMLInputElement;
	private previewEl!: HTMLDivElement;
	private hexEl!: HTMLSpanElement;
	private readonly palette: string[];
	private swatchButtons: HTMLButtonElement[] = [];

	public static Prompt(
		app: App,
		header: string,
		initial?: unknown,
		colors?: unknown
	): Promise<string> {
		const modal = new SelectColor(app, header, initial, colors);
		return modal.waitForClose;
	}

	protected constructor(
		app: App,
		private header: string,
		initial?: unknown,
		colors?: unknown
	) {
		super(app);
		this.color = normalizeHexForColorInput(initial);
		this.palette = normalizePaletteInput(colors);

		this.waitForClose = new Promise<string>((resolve, reject) => {
			this.resolvePromise = resolve;
			this.rejectPromise = reject;
		});

		this.display();
		this.open();
	}

	/** Sync preview, hex label, native `<input type="color">`, and preset swatch highlight. */
	private syncColorUI() {
		this.colorInputEl.value = this.color;
		this.previewEl.style.backgroundColor = this.color;
		this.hexEl.setText(this.color.toUpperCase());
		for (const btn of this.swatchButtons) {
			const h = btn.getAttribute("data-nc-hex");
			if (h) btn.toggleClass("is-active", h === this.color);
		}
	}

	/** Single-click preset: set current color (opens system picker from this value next). */
	private applyPreset(hex: string) {
		this.color = hex;
		this.syncColorUI();
	}

	private display() {
		this.containerEl.addClass("ncSelectColorModal");
		this.contentEl.empty();
		this.titleEl.textContent = this.header;
		this.swatchButtons = [];

		const mainContentContainer = this.contentEl.createDiv({
			cls: "nc-select-color-body",
		});

		const pickerWrap = mainContentContainer.createDiv({
			cls: "nc-color-picker-wrap",
		});
		const surface = pickerWrap.createEl("label", {
			cls: "nc-color-picker-surface",
		});

		this.colorInputEl = surface.createEl("input", {
			type: "color",
			cls: "nc-color-picker-native",
		});
		this.colorInputEl.value = this.color;
		this.previewEl = surface.createDiv({ cls: "nc-color-picker-preview" });

		const meta = pickerWrap.createDiv({ cls: "nc-color-picker-meta" });
		this.hexEl = meta.createEl("span", { cls: "nc-color-picker-hex" });

		this.colorInputEl.addEventListener("input", () => {
			this.color = this.colorInputEl.value;
			this.syncColorUI();
		});

		if (this.palette.length > 0) {
			const paletteEl = mainContentContainer.createDiv({
				cls: "nc-color-palette",
			});
			mainContentContainer.insertBefore(paletteEl, pickerWrap);
			for (const hex of this.palette) {
				const btn = paletteEl.createEl("button", {
					type: "button",
					cls: "nc-color-swatch",
					attr: { "aria-label": hex, "data-nc-hex": hex },
				});
				btn.style.backgroundColor = hex;
				btn.addEventListener("click", () => this.applyPreset(hex));
				btn.addEventListener("dblclick", (ev) => {
					ev.preventDefault();
					this.applyPreset(hex);
					this.submit();
				});
				this.swatchButtons.push(btn);
			}
		}

		this.syncColorUI();

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
	initial?: unknown,
	colors: unknown = [],
	header: string='',
): Promise<string | null> {
	try {
		return await SelectColor.Prompt(this.app, header, initial, colors);
	} catch {
		return null;
	}
}
