import type { App } from "obsidian";
import {
	ButtonComponent,
	editorLivePreviewField,
	MarkdownView,
	Modal,
	TFile,
	TextAreaComponent,
	WorkspaceLeaf
} from "obsidian";

export class MultInputPrompt extends Modal {
	public waitForClose: Promise<string>;

	private resolvePromise: (input: string) => void;
	private rejectPromise: (reason?: unknown) => void;
	private didSubmit = false;
	private input: string;
	private readonly placeholder: string;
	private modalLeafRef?: WorkspaceLeaf;
	private prevActiveLeaf?: WorkspaceLeaf | null;
	private tempFile?: TFile;
	private tempFilePath = "";
	private readonly tempFolder = ".obsidian/plugins/note-chain/.temp";

	public static Prompt(
		app: App,
		header: string,
		placeholder?: string,
		value?: string
	): Promise<string> {
		const newPromptModal = new MultInputPrompt(
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
		this.containerEl.addClass("quickAddModal", "qaInputPrompt", "qaMultInputPrompt");
		this.contentEl.empty();
		this.titleEl.textContent = this.header;
		this.prevActiveLeaf = this.app.workspace.getMostRecentLeaf();

		const mainContentContainer: HTMLDivElement = this.contentEl.createDiv({
			cls: "qa-mult-input-main"
		});
		mainContentContainer.addEventListener("keydown", this.submitEnterCallback);
		const editorContainer = mainContentContainer.createDiv({
			cls: "qa-mult-input-editor"
		});
		void this.mountMarkdownEditor(editorContainer);
		this.createButtonBar(mainContentContainer);
	}

	private async mountMarkdownEditor(container: HTMLDivElement) {
		try {
			this.modalLeafRef = this.app.workspace.createLeafInParent(
				this.app.workspace.rootSplit,
				0
			);
			if (!this.modalLeafRef) {
				this.mountFallbackEditor(container);
				return;
			}

			// Same pattern as modal-opener: hide the workspace chrome, then move the view into the modal.
			(this.modalLeafRef as any).containerEl.style.display = "none";

			await this.ensureTempFolder();
			this.tempFilePath = `${this.tempFolder}/mult-input-${Date.now()}.md`;
			this.tempFile = await this.app.vault.create(this.tempFilePath, this.input);
			await this.modalLeafRef.openFile(this.tempFile, { state: { mode: "source" } });

			const hostEl = this.modalLeafRef.view.containerEl;
			hostEl.addClass("qa-mult-input-leaf-host");
			container.appendChild(hostEl);

			const leafContent = container.querySelector(".workspace-leaf-content");
			if (leafContent instanceof HTMLElement) {
				leafContent.classList.add("qa-mult-input-leaf");
			} else {
				hostEl.classList.add("qa-mult-input-leaf");
			}

			await this.finishMarkdownEditorSetup();
		} catch {
			this.mountFallbackEditor(container);
		}
	}

	/**
	 * Obsidian "Live Preview" is source mode + CM state {@link editorLivePreviewField} === true.
	 * Command ids vary by version; resolve dynamically from the command registry when possible.
	 */
	private findToggleLivePreviewCommandId(): string | undefined {
		const known = ["markdown:toggle-live-preview", "editor:toggle-live-preview"];
		const cmds = (this.app as any).commands?.commands as
			| Record<string, { name?: string }>
			| undefined;
		for (const id of known) {
			if (cmds?.[id]) return id;
		}
		if (!cmds) return undefined;
		for (const [id, cmd] of Object.entries(cmds)) {
			const name = (cmd?.name ?? "").toLowerCase();
			if (name.includes("live preview")) return id;
			if (id.includes("live") && id.includes("preview")) return id;
		}
		return undefined;
	}

	private getCmLivePreviewFlag(view: MarkdownView): boolean | undefined {
		const cm = (view.editor as any)?.cm;
		if (!cm?.state) return undefined;
		try {
			return cm.state.field(editorLivePreviewField, false);
		} catch {
			return undefined;
		}
	}

	private runCommandById(id: string) {
		(this.app as any).commands?.executeCommandById?.(id);
	}

	private async finishMarkdownEditorSetup() {
		if (!this.modalLeafRef) return;
		const view = this.modalLeafRef.view;
		if (!(view instanceof MarkdownView)) return;

		this.app.workspace.setActiveLeaf(this.modalLeafRef, { focus: true });

		const v = view as any;
		if (typeof v.setMode === "function") {
			await v.setMode("source");
		}

		const currentState = this.modalLeafRef.getViewState();
		await this.modalLeafRef.setViewState(
			{
				...currentState,
				state: {
					...(currentState.state as Record<string, unknown>),
					mode: "source",
					source: false
				}
			},
			{ focus: true }
		);
		v.currentMode?.applyMode?.(false);

		await new Promise<void>((r) => requestAnimationFrame(() => r()));
		await new Promise<void>((r) => requestAnimationFrame(() => r()));

		const toggleId = this.findToggleLivePreviewCommandId();
		let live = this.getCmLivePreviewFlag(view);
		if (live === false && toggleId) {
			this.runCommandById(toggleId);
			await new Promise<void>((r) => requestAnimationFrame(() => r()));
			live = this.getCmLivePreviewFlag(view);
		}
		if (live === false && toggleId) {
			this.runCommandById(toggleId);
		}

		const cmContent = view.containerEl.querySelector(
			".cm-content"
		) as HTMLElement | null;
		if (cmContent && this.placeholder) {
			cmContent.setAttribute("data-placeholder", this.placeholder);
		}
		view.editor?.focus();
	}

	private mountFallbackEditor(container: HTMLElement) {
		const fallback = new TextAreaComponent(container);
		fallback.inputEl.classList.add("qa-mult-fallback-editor");
		fallback
			.setPlaceholder(this.placeholder ?? "")
			.setValue(this.input)
			.onChange((value: string) => (this.input = value));
	}

	private async ensureTempFolder() {
		const existing = this.app.vault.getAbstractFileByPath(this.tempFolder);
		if (existing) return;
		await this.app.vault.createFolder(this.tempFolder);
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
		).setCta();
		this.createButton(
			buttonBarContainer,
			"Cancel",
			this.cancelClickCallback
		);

		buttonBarContainer.classList.add("button-bar");
	}

	private submitClickCallback = (_evt: MouseEvent) => this.submit();
	private cancelClickCallback = (_evt: MouseEvent) => this.cancel();

	private submitEnterCallback = (evt: KeyboardEvent) => {
		if (!evt.isComposing && evt.key === "Enter" && (evt.ctrlKey || evt.metaKey)) {
			evt.preventDefault();
			this.submit();
		}
	};

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
		const main = this.contentEl.querySelector(".qa-mult-input-main");
		main?.removeEventListener("keydown", this.submitEnterCallback);
	}

	private async syncInputFromTempFile() {
		if (!this.tempFile) return;
		this.input = await this.app.vault.read(this.tempFile);
	}

	private async cleanupTempResources() {
		if (this.modalLeafRef?.view?.containerEl) {
			this.modalLeafRef.view.containerEl.remove();
		}
		if (this.modalLeafRef) {
			this.modalLeafRef.detach();
			this.modalLeafRef = undefined;
		}
		if (this.tempFile) {
			await this.app.vault.delete(this.tempFile, true);
			this.tempFile = undefined;
		}
		if (this.prevActiveLeaf) {
			try {
				this.app.workspace.setActiveLeaf(this.prevActiveLeaf, {
					focus: true
				});
			} catch {
				/* leaf may be gone */
			}
			this.prevActiveLeaf = undefined;
		}
	}

	onOpen() {
		super.onOpen();
	}

	onClose() {
		super.onClose();
		void this.handleModalClose();
	}

	private async handleModalClose() {
		await this.syncInputFromTempFile();
		this.resolveInput();
		this.removeInputListener();
		await this.cleanupTempResources();
	}
}

export async function dialog_mult_prompt(
	header: string = "Input",
	placeholder: string = "",
	value: string = ""
) {
	try {
		return await MultInputPrompt.Prompt(
			this.app,
			header,
			placeholder,
			value
		);
	} catch {
		return null;
	}
}
