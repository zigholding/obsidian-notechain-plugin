import type { App } from "obsidian";
import {
	ButtonComponent,
	Component,
	MarkdownView,
	MarkdownRenderer,
	Modal,
	Notice,
	TFile,
	WorkspaceLeaf,
} from "obsidian";

type MarkdownPromptOptions = {
	title?: string;
	placeholder?: string;
	value?: string;
	confirmText?: string;
	cancelText?: string;
};

/**
 * Markdown 输入弹窗：左侧原生编辑器，右侧实时预览。
 * 确认后返回输入文本，取消返回 null。
 */
class MarkdownInputPrompt extends Modal {
	private resolvePromise!: (value: string) => void;
	private rejectPromise!: (reason?: unknown) => void;
	public readonly promise: Promise<string>;
	private submitted = false;
	private input = "";
	private modalLeafRef?: WorkspaceLeaf;
	private tempFile?: TFile;
	private readonly tempFilePath = "note-chain-templater-target.md";
	private vaultChangeRef?: (file: TFile) => void;
	private previewContainer!: HTMLElement;
	private previewComponent: Component | null = null;
	private renderToken = 0;
	private readonly isZh: boolean;
	private syncTimer: number | null = null;
	private isSyncing = false;
	private hasPendingSync = false;
	private closeReason: unknown = "no input given.";

	public static open(app: App, options: MarkdownPromptOptions = {}): Promise<string> {
		const modal = new MarkdownInputPrompt(app, options);
		modal.open();
		return modal.promise;
	}

	constructor(app: App, private readonly options: MarkdownPromptOptions) {
		super(app);
		this.isZh = window.localStorage.getItem("language") === "zh";
		this.input = options.value ?? "";
		this.promise = new Promise<string>((resolve, reject) => {
			this.resolvePromise = resolve;
			this.rejectPromise = reject;
		});
	}

	onOpen(): void {
		super.onOpen();
		this.modalEl.addClass("nc-markdown-input-modal");
		this.titleEl.setText(this.options.title ?? (this.isZh ? "Markdown 输入" : "Markdown Input"));
		this.contentEl.empty();

		const root = this.contentEl.createDiv({ cls: "nc-markdown-input-root" });
		const editorWrap = root.createDiv({ cls: "nc-markdown-input-editor-wrap" });
		this.previewContainer = root.createDiv({ cls: "nc-markdown-input-preview markdown-rendered" });
		this.previewComponent = new Component();
		this.previewComponent.load();
		void this.mountEditor(editorWrap).catch((error) => {
			this.closeReason = error;
			new Notice((error as Error)?.message || "Failed to mount WorkspaceLeaf editor.");
			this.close();
		});

		const actions = this.contentEl.createDiv({ cls: "nc-markdown-input-actions" });
		new ButtonComponent(actions)
			.setButtonText(this.options.confirmText ?? (this.isZh ? "确定" : "Confirm"))
			.setCta()
			.onClick(() => this.confirm());
		new ButtonComponent(actions)
			.setButtonText(this.options.cancelText ?? (this.isZh ? "取消" : "Cancel"))
			.onClick(() => this.close());

		void this.renderPreview();
	}

	private async renderPreview(): Promise<void> {
		const token = ++this.renderToken;
		this.previewContainer.empty();
		const source =
			this.input.trim().length > 0
				? this.input
				: this.isZh
					? "*预览为空*"
					: "*Preview is empty*";
		if (!this.previewComponent) return;
		await MarkdownRenderer.render(this.app, source, this.previewContainer, "", this.previewComponent);
		if (token !== this.renderToken) return;
	}

	private async ensureTempFile(): Promise<TFile> {
		const existed = this.app.vault.getFileByPath(this.tempFilePath);
		if (existed) return existed;
		try {
			return await this.app.vault.create(this.tempFilePath, "");
		} catch {
			const file = this.app.vault.getFileByPath(this.tempFilePath);
			if (file) return file;
			throw new Error(`Failed to create temp file: ${this.tempFilePath}`);
		}
	}

	private async mountEditor(container: HTMLElement): Promise<void> {
		this.modalLeafRef = this.app.workspace.createLeafInParent(this.app.workspace.rootSplit, 0);
		if (!this.modalLeafRef) {
			throw new Error("Failed to create WorkspaceLeaf.");
		}
		// Prevent workspace split jitter while the leaf is being prepared.
		(this.modalLeafRef as any).containerEl.style.display = "none";

		this.tempFile = await this.ensureTempFile();
		await this.app.vault.modify(this.tempFile, this.options.value ?? "");
		this.input = this.options.value ?? "";
		await this.modalLeafRef.openFile(this.tempFile, { state: { mode: "source" } });

		const hostEl = this.modalLeafRef.view.containerEl;
		hostEl.addClass("nc-markdown-input-leaf-host");
		container.appendChild(hostEl);
		const leafContent = container.querySelector(".workspace-leaf-content");
		if (leafContent instanceof HTMLElement) {
			leafContent.classList.add("nc-markdown-input-leaf");
		} else {
			hostEl.classList.add("nc-markdown-input-leaf");
		}

		if (this.modalLeafRef.view instanceof MarkdownView) {
			this.modalLeafRef.view.editor?.focus();
		}

		this.vaultChangeRef = (file: TFile) => {
			if (file.path !== this.tempFilePath) return;
			this.scheduleSyncFromTempFile();
		};
		this.app.vault.on("modify", this.vaultChangeRef);
		this.scheduleSyncFromTempFile();
	}

	private scheduleSyncFromTempFile() {
		if (this.syncTimer !== null) {
			window.clearTimeout(this.syncTimer);
		}
		this.syncTimer = window.setTimeout(() => {
			this.syncTimer = null;
			void this.syncInputFromTempFileAndRender();
		}, 120);
	}

	private async syncInputFromTempFileAndRender(): Promise<void> {
		if (!this.tempFile) return;
		if (this.isSyncing) {
			this.hasPendingSync = true;
			return;
		}
		this.isSyncing = true;
		this.input = await this.app.vault.read(this.tempFile);
		void this.renderPreview();
		this.isSyncing = false;
		if (this.hasPendingSync) {
			this.hasPendingSync = false;
			this.scheduleSyncFromTempFile();
		}
	}

	private async confirm(): Promise<void> {
		await this.syncInputFromTempFileAndRender();
		this.submitted = true;
		this.closeReason = null;
		this.resolvePromise(this.input);
		this.close();
	}

	onClose(): void {
		super.onClose();
		void this.handleClose();
	}

	private async handleClose(): Promise<void> {
		if (!this.submitted) this.rejectPromise(this.closeReason);
		if (this.vaultChangeRef) {
			this.app.vault.off("modify", this.vaultChangeRef);
			this.vaultChangeRef = undefined;
		}
		if (this.syncTimer !== null) {
			window.clearTimeout(this.syncTimer);
			this.syncTimer = null;
		}
		if (this.modalLeafRef?.view?.containerEl) {
			this.modalLeafRef.view.containerEl.remove();
		}
		if (this.modalLeafRef) {
			this.modalLeafRef.detach();
			this.modalLeafRef = undefined;
		}
		this.tempFile = undefined;
		if (this.previewComponent) {
			this.previewComponent.unload();
			this.previewComponent = null;
		}
		this.contentEl.empty();
	}
}

export async function dialog_markdown_prompt(
	title = "",
	placeholder = "",
	value = "",
): Promise<string | null> {
	try {
		const app = (this as { app: App }).app;
		return await MarkdownInputPrompt.open(app, { title, placeholder, value });
	} catch (error) {
		if (error === "no input given.") return null;
		new Notice(
			(error as Error)?.message || "Failed to open markdown prompt with WorkspaceLeaf."
		);
		return null;
	}
}
