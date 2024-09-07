
import { 
	App, Modal, Notice,MarkdownRenderer,Component
} from 'obsidian';

import NoteChainPlugin from "../main";

export class NoteContentModal extends Modal {
    content: string;
    plugin: NoteChainPlugin;

    constructor(app: App, content: string, plugin: NoteChainPlugin) {
        super(app);
        this.content = content;
        this.plugin = plugin;
        this.modalEl.style.width = `${this.plugin.settings.modal_default_width}px`;
        this.modalEl.style.height = `${this.plugin.settings.modal_default_height}px`;
    }

    onOpen() {
        const {contentEl} = this;
        contentEl.empty();
        
        const container = contentEl.createDiv();
        container.addClass('markdown-rendered');

        // 创建一个临时的 Component 实例
        const component = new Component();
        
        MarkdownRenderer.renderMarkdown(this.content, container, '', component);

        this.addClickListener(container);
    }

    onClose() {
        const {contentEl} = this;
        contentEl.empty();
    }

    addClickListener(container: HTMLElement) {
        container.addEventListener('click', (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (target.tagName === 'A' && target.hasClass('internal-link')) {
                event.preventDefault();
                const href = target.getAttribute('href');
                if (href) {
                    this.openNoteInMainView(href);
                }
            }
        });
    }

    async openNoteInMainView(linkText: string) {
        try {
            await this.app.workspace.openLinkText(linkText, '', false, { active: true });
            this.close();
        } catch (error) {
            new Notice(`Error opening note: ${error.message}`);
        }
    }
}

