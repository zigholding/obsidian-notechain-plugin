
import { 
	App, Modal, Notice,MarkdownRenderer,Component,
    TFile
} from 'obsidian';

import NoteChainPlugin from "../main";

export class NoteContentModal extends Modal {
    content: string;
    plugin: NoteChainPlugin;
    sourcePath: string;

    constructor(app: App, content: string, plugin: NoteChainPlugin, sourcePath: string) {
        super(app);
        this.plugin = plugin;
        if(sourcePath && (sourcePath.endsWith('.canvas') || sourcePath.endsWith('.base'))){
            if('datacore' in (this.plugin.app as any).plugins.plugins){
                content = `
\`\`\`datacorejsx
return (
    <dc.Markdown
        content=\`![[${sourcePath}]]\`
    />
);
dv.span();
\`\`\`
                `.trim()
                content = `
\`\`\`dataviewjs
dv.span(\`![[${sourcePath}]]\`);
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

        const container = contentEl.createDiv({ cls: 'note-content-container' });
        container.addClass('markdown-rendered');
        container.style.display = 'table-cell';
        container.style.verticalAlign = 'middle';
        container.style.padding = '20px'; // 添加一些内边距

        // 创建一个临时的 Component 实例
        const component = new Component();
        MarkdownRenderer.render(this.app, this.content, container, this.sourcePath, component).then(x=>{
            this.addClickListener(container);
        });
        
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