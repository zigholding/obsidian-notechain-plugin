import { App, ButtonComponent, Modal, getLanguage } from "obsidian";

/** Obsidian modal confirm (avoids `window.confirm` / `no-alert`). */
export function confirmAction(app: App, message: string, title?: string): Promise<boolean> {
	return new ConfirmModal(app, message, title).waitForClose;
}

class ConfirmModal extends Modal {
	public waitForClose: Promise<boolean>;
	private resolvePromise!: (ok: boolean) => void;
	private decided = false;

	constructor(app: App, private message: string, private heading?: string) {
		super(app);
		this.waitForClose = new Promise((resolve) => {
			this.resolvePromise = resolve;
		});
		this.display();
		this.open();
	}

	private display() {
		const zh = getLanguage() === "zh";
		this.containerEl.addClass("ncConfirmModal");
		this.titleEl.setText(this.heading ?? (zh ? "确认" : "Confirm"));
		this.contentEl.empty();
		for (const line of this.message.split("\n")) {
			this.contentEl.createDiv({ text: line });
		}
		const bar = this.contentEl.createDiv({ cls: "button-bar" });
		new ButtonComponent(bar)
			.setButtonText(zh ? "确定" : "OK")
			.setCta()
			.onClick(() => this.finish(true));
		new ButtonComponent(bar)
			.setButtonText(zh ? "取消" : "Cancel")
			.onClick(() => this.finish(false));
	}

	private finish(ok: boolean) {
		if (this.decided) return;
		this.decided = true;
		this.resolvePromise(ok);
		this.close();
	}

	onClose() {
		super.onClose();
		if (!this.decided) {
			this.decided = true;
			this.resolvePromise(false);
		}
	}
}
