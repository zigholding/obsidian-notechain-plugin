
import { 
	App, Modal, Notice,MarkdownRenderer,Component,
    TFile
} from 'obsidian';

import NoteChainPlugin from "../main";

export class NoteContentModal extends Modal {
    content: string;
    plugin: NoteChainPlugin;
    sourcePath: string;
    private renderComponent: Component | null = null;

    constructor(app: App, content: string, plugin: NoteChainPlugin, sourcePath: string) {
        super(app);
        this.plugin = plugin;
        // 为当前 Modal 添加专用 class，方便精确控制样式而不影响其他插件 / 核心模态框
        this.modalEl.addClass('notechain-modal');
        if(sourcePath && (sourcePath.endsWith('.canvas') || sourcePath.endsWith('.base'))){
            if('datacore' in (this.plugin.app as any).plugins.plugins){
                content = `
\`\`\`datacorejsx
return (
    <dc.Markdown
        content="![[${sourcePath}]]"
    />
);
\`\`\`
                `.trim()
            }else if('dataview' in (this.plugin.app as any).plugins.plugins){
                content = `
\`\`\`dataviewjs
dv.span(\`![[${sourcePath}]]\`);
\`\`\`
                `.trim()
            }
        }
        this.content = content;
        this.sourcePath = sourcePath;
    }

    onOpen() {
        const {contentEl} = this;
        contentEl.empty();
        this.modalEl.style.display = 'flex';
        this.modalEl.style.overflow = 'auto'; // 添加滚动条

        // 根据 frontmatter 配置设置 modal 大小
        this.setModalSize();

        const container = contentEl.createDiv({ cls: 'note-content-container' });
        container.addClass('markdown-rendered');
        // 让内容区域占满 modal 指定大小
        container.style.display = 'block';
        container.style.width = '100%';
        container.style.height = '100%';
        container.style.boxSizing = 'border-box';
        container.style.padding = '0px';

        // 创建 Component 实例并手动管理生命周期
        this.renderComponent = new Component();
        this.renderComponent.load();
        MarkdownRenderer.render(this.app, this.content, container, this.sourcePath, this.renderComponent).then(x=>{
            this.addClickListener(container);
        });
        
    }

    private setModalSize() {
        if (!this.sourcePath) {
            return;
        }

        const file = this.app.vault.getAbstractFileByPath(this.sourcePath);
        if (!file) {
            return;
        }

        const modalSizeConfig = this.plugin.editor.get_frontmatter_config(file, 'notechain.modal_size');
        if (!Array.isArray(modalSizeConfig) || (modalSizeConfig.length !== 2 && modalSizeConfig.length !== 4)) {
            return;
        }

        // 判断设备类型
        const isMobile = (this.app as any).isMobile === true;
        
        let width: number, height: number;
        
        if (modalSizeConfig.length === 2) {
            // 长度为2时，mobile和pc使用相同的尺寸
            // 格式: [width, height]
            width = modalSizeConfig[0];
            height = modalSizeConfig[1];
        } else {
            // 长度为4时，根据设备类型选择对应的尺寸配置
            // 格式: [pc_width, pc_height, mobile_width, mobile_height]
            width = isMobile ? modalSizeConfig[2] : modalSizeConfig[0];
            height = isMobile ? modalSizeConfig[3] : modalSizeConfig[1];
        }
        
        if (typeof width === 'number' && typeof height === 'number') {
            this.modalEl.style.width = `${width}px`;
            this.modalEl.style.height = `${height}px`;
            this.modalEl.style.maxWidth = `${width}px`;
            this.modalEl.style.maxHeight = `${height}px`;
        }
    }

    onClose() {
        let {contentEl} = this;
        contentEl.empty();
        // 清理 Component
        if (this.renderComponent) {
            this.renderComponent.unload();
            this.renderComponent = null;
        }
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

        container.querySelectorAll('a.internal-link').forEach((el) => {
            const href = el.getAttribute('href');
            if (href) {
                el.setAttribute('data-href', href);
                el.setAttr('aria-label', href);
                el.addClass('hover-link'); // ✅ 核心
        
                el.addEventListener('mouseenter', (e) => {
                    this.app.workspace.trigger("hover-link", {
                        event: e,
                        source: 'markdown',
                        hoverParent: el,
                        targetEl: el,
                        linktext: href,
                        sourcePath: this.sourcePath,
                    });
                });
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


export class NoteEditorModal extends Modal {
    filePath: string; // 添加文件路径属性
    isEditMode: boolean; // 添加编辑模式属性

    constructor(app: App, filePath: string, isEditMode: boolean = false) {
        super(app);
        this.filePath = filePath;
        this.isEditMode = isEditMode;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        if (this.isEditMode) {
            // 获取文件对象
            let file = this.app.vault.getAbstractFileByPath(this.filePath) as TFile;
            if (file) {
                // 创建一个新的工作区叶子并打开文件
                const leaf = this.app.workspace.getLeaf(true);
                await leaf.openFile(file, { state: { mode: 'source' } }); // 以编辑模式打开文件

                // 关闭当前模态窗口
                this.close();
            } else {
                new Notice(`File not found: ${this.filePath}`);
            }
        } else {
            // 其他模式的处理逻辑
            new Notice('Not in edit mode.');
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}