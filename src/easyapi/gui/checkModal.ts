import { App, ButtonComponent, Component, MarkdownRenderer, Modal, getLanguage } from "obsidian";

/** Yes/No 确认框。Yes 为 true，No 或关闭为 false。content 按 Markdown 渲染。 */
export function dialogCheck(app: App, title: string, content: string): Promise<boolean> {
	return new CheckModal(app, title, content).waitForClose;
}

class CheckModal extends Modal {
	public waitForClose: Promise<boolean>;
	private resolvePromise!: (ok: boolean) => void;
	private decided = false;
	private renderComponent: Component | null = null;

	constructor(app: App, private heading: string, private content: string) {
		super(app);
		this.waitForClose = new Promise((resolve) => {
			this.resolvePromise = resolve;
		});
		this.open();
	}

	onOpen() {
		const zh = getLanguage() === "zh";
		this.containerEl.addClass("ncConfirmModal");
		this.containerEl.addClass("ncCheckModal");
		this.titleEl.setText(this.heading.trim() || (zh ? "确认" : "Confirm"));
		this.contentEl.empty();

		const body = this.contentEl.createDiv({ cls: "nc-check-content markdown-rendered" });
		this.renderComponent = new Component();
		this.renderComponent.load();
		const sourcePath = this.app.workspace.getActiveFile()?.path ?? "";
		MarkdownRenderer.render(
			this.app,
			this.content,
			body,
			sourcePath,
			this.renderComponent,
		).catch(() => {
			body.setText(this.content);
		});

		const bar = this.contentEl.createDiv({ cls: "button-bar nc-check-actions" });
		new ButtonComponent(bar)
			.setButtonText(zh ? "否" : "No")
			.onClick(() => this.finish(false));
		new ButtonComponent(bar)
			.setButtonText(zh ? "是" : "Yes")
			.setCta()
			.onClick(() => this.finish(true));
	}

	private finish(ok: boolean) {
		if (this.decided) return;
		this.decided = true;
		this.resolvePromise(ok);
		this.close();
	}

	onClose() {
		super.onClose();
		this.renderComponent?.unload();
		this.renderComponent = null;
		if (!this.decided) {
			this.decided = true;
			this.resolvePromise(false);
		}
	}
}
