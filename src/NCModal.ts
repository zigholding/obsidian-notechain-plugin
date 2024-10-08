
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
    }

    onOpen() {
        const {contentEl} = this;
        contentEl.empty();
        this.modalEl.style.display = 'flex';
        this.modalEl.style.overflow = 'auto'; // 添加滚动条

        const container = contentEl.createDiv({ cls: 'note-content-container' });
        container.addClass('markdown-rendered');
        container.style.display = 'table-cell';
        container.style.verticalAlign = 'middle';
        container.style.padding = '20px'; // 添加一些内边距

        // 创建一个临时的 Component 实例
        const component = new Component();
        
        MarkdownRenderer.render(this.app, this.content, container, '', component);

        this.addClickListener(container);
        
    }

    onClose() {
        let {contentEl} = this;
        contentEl.empty();
    }

    addClickListener(container: HTMLElement) {
        container.addEventListener('click', (event: MouseEvent) => {
            let target = event.target as HTMLElement;
            if (target.tagName === 'A' && target.hasClass('internal-link')) {
                event.preventDefault();
                let href = target.getAttribute('href');
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

