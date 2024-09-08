
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
        
        // 移除默认的 padding
        this.modalEl.style.padding = '0';
        
        // 设置模态框样式
        this.modalEl.style.display = 'flex';
        this.modalEl.style.justifyContent = 'center';
        this.modalEl.style.alignItems = 'center';
        this.modalEl.style.width = `${this.plugin.settings.modal_default_width}px`;;
        this.modalEl.style.height = `${this.plugin.settings.modal_default_height}px`;;
        
        const wrapper = contentEl.createDiv({ cls: 'note-content-wrapper' });
        wrapper.style.display = 'flex';
        wrapper.style.justifyContent = 'center';
        wrapper.style.alignItems = 'center';
        wrapper.style.width = '100%';
        wrapper.style.height = '100%';
        wrapper.style.overflow = 'auto';

        const container = wrapper.createDiv({ cls: 'note-content-container' });
        container.addClass('markdown-rendered');
        container.style.maxWidth = '100%';
        container.style.maxHeight = '100%';
        container.style.padding = '20px';
        container.style.overflow = 'auto';

        // 创建一个临时的 Component 实例
        const component = new Component();
        
        MarkdownRenderer.render(this.app, this.content, container, '', component).then(() => {
            // 渲染完成后调整容器大小
            this.adjustContainerSize();
        });

        this.addClickListener(container);
    }

    adjustContainerSize() {
        const container = this.contentEl.querySelector('.note-content-container') as HTMLElement;
        if (!container) return;

        const maxWidth = this.modalEl.clientWidth - 40; // 40px for padding
        const maxHeight = this.modalEl.clientHeight - 40; // 40px for padding

        container.style.width = `${Math.min(container.scrollWidth, maxWidth)}px`;
        container.style.height = `${Math.min(container.scrollHeight, maxHeight)}px`;
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

