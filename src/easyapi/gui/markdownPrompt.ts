import type { App } from "obsidian";
import {
	ButtonComponent,
	Component,
	MarkdownView,
	MarkdownRenderer,
	Modal,
	TextAreaComponent,
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
	private editorComponent: TextAreaComponent | null = null;
	private modalLeafRef?: WorkspaceLeaf;
	private tempFile?: TFile;
	private tempFilePath = "";
	private readonly tempFolder = ".obsidian/plugins/note-chain/.temp";
	private vaultChangeRef?: (file: TFile) => void;
	private previewContainer!: HTMLElement;
	private previewComponent: Component | null = null;
	private renderToken = 0;
	private readonly isZh: boolean;
	private syncTimer: number | null = null;
	private isSyncing = false;
	private hasPendingSync = false;

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
		void this.mountEditor(editorWrap);

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

	private mountFallbackEditor(container: HTMLElement): void {
		const editor = new TextAreaComponent(container);
		editor.inputEl.addClass("nc-markdown-input-textarea");
		editor
			.setPlaceholder(this.options.placeholder ?? "")
			.setValue(this.options.value ?? "")
			.onChange((value) => {
				this.input = value;
				void this.renderPreview();
			});
		this.editorComponent = editor;
		this.input = editor.getValue();
		void this.renderPreview();
	}

	private async ensureTempFolder(): Promise<void> {
		const existing = this.app.vault.getAbstractFileByPath(this.tempFolder);
		if (existing) return;
		await this.app.vault.createFolder(this.tempFolder);
	}

	private async mountEditor(container: HTMLElement): Promise<void> {
		try {
			this.modalLeafRef = this.app.workspace.createLeafInParent(this.app.workspace.rootSplit, 0);
			if (!this.modalLeafRef) {
				this.mountFallbackEditor(container);
				return;
			}
			// Prevent workspace split jitter while the leaf is being prepared.
			(this.modalLeafRef as any).containerEl.style.display = "none";

			await this.ensureTempFolder();
			this.tempFilePath = `${this.tempFolder}/markdown-prompt-${Date.now()}.md`;
			this.tempFile = await this.app.vault.create(this.tempFilePath, this.options.value ?? "");
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
		} catch {
			this.mountFallbackEditor(container);
		}
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
		if (this.tempFile) {
			await this.syncInputFromTempFileAndRender();
		} else {
			this.input = this.editorComponent?.getValue() ?? this.input;
		}
		this.submitted = true;
		this.resolvePromise(this.input);
		this.close();
	}

	onClose(): void {
		super.onClose();
		void this.handleClose();
	}

	private async handleClose(): Promise<void> {
		if (!this.submitted) this.rejectPromise("no input given.");
		if (this.vaultChangeRef) {
			this.app.vault.off("modify", this.vaultChangeRef);
			this.vaultChangeRef = undefined;
		}
		if (this.syncTimer !== null) {
			window.clearTimeout(this.syncTimer);
			this.syncTimer = null;
		}
		this.editorComponent = null;
		if (this.modalLeafRef?.view?.containerEl) {
			this.modalLeafRef.view.containerEl.remove();
		}
		if (this.modalLeafRef) {
			this.modalLeafRef.detach();
			this.modalLeafRef = undefined;
		}
		if (this.tempFile) {
			try {
				await this.app.vault.delete(this.tempFile, true);
			} catch {
				// ignore temp cleanup failures
			}
			this.tempFile = undefined;
		}
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
	} catch {
		return null;
	}
}
