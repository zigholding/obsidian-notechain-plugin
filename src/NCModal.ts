
import { 
	App, Modal, Notice,MarkdownRenderer,Component,
    TFile
} from 'obsidian';

import NoteChainPlugin from "./plugin";
import { hasCommunityPlugin } from './obsidian-app';

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
        this.containerEl.addClass('notechain-modal-container');
        if(sourcePath && (sourcePath.endsWith('.canvas') || sourcePath.endsWith('.base'))){
            if(hasCommunityPlugin(this.plugin.app, 'datacore')){
                content = `
\`\`\`datacorejsx
return (
    <dc.Markdown
        content="![[${sourcePath}]]"
    />
);
\`\`\`
                `.trim()
            }else if(hasCommunityPlugin(this.plugin.app, 'dataview')){
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
        this.setModalSize();

        const container = contentEl.createDiv({ cls: 'note-content-container' });
        container.addClass('markdown-rendered');
        // Apply frontmatter `cssClasses` to the markdown root,
        // so CSS selectors defined in the note can match this modal view.
        let cssClasses: unknown = null;
        if (this.sourcePath) {
            const cfile = this.plugin.easyapi.file.get_tfile(this.sourcePath);
            if (cfile) {
                cssClasses = this.plugin.editor.get_frontmatter(cfile, 'cssClasses');
            }
        }
        const normalizedCssClasses =
            typeof cssClasses === 'string'
                ? cssClasses.split(/[\s,]+/).filter(Boolean)
                : Array.isArray(cssClasses)
                    ? cssClasses.filter((x) => typeof x === 'string' && x.trim().length > 0)
                    : [];
        normalizedCssClasses.forEach((c) => container.addClass(c));

        // 创建 Component 实例并手动管理生命周期
        this.renderComponent = new Component();
        this.renderComponent.load();
        MarkdownRenderer.render(this.app, this.content, container, this.sourcePath, this.renderComponent).then(()=>{
            this.addClickListener(container);
        }).catch(() => { /* render failed */ });
        
    }

    private setModalSize() {
        const isMobile = this.plugin.easyapi.isMobile;
        if (isMobile) {
            this.modalEl.addClass('is-mobile');
        }

        let { width, height } = this.getDefaultModalSize(isMobile);

        if (this.sourcePath) {
            const file = this.app.vault.getAbstractFileByPath(this.sourcePath);
            if (file) {
                const parsed = this.parseModalSizeConfig(
                    this.plugin.editor.get_frontmatter_config(file, 'notechain.modal_size'),
                    isMobile
                );
                if (parsed) {
                    width = parsed.width;
                    height = parsed.height;
                }
            }
        }

        this.applyModalSize(width, height);
    }

    /** 电脑默认读设置 800×600；手机默认铺满可视区域。 */
    private getDefaultModalSize(isMobile: boolean): { width: number | string; height: number | string } {
        const settings = this.plugin.settings?.notechain ?? {};
        if (isMobile) {
            const w = this.normalizeSize(settings.modal_default_width_mobile);
            const h = this.normalizeSize(settings.modal_default_height_mobile);
            if (w != null && h != null) {
                return { width: w, height: h };
            }
            return { width: '92vw', height: '85dvh' };
        }
        const width = this.normalizeSize(settings.modal_default_width) ?? 800;
        const height = this.normalizeSize(settings.modal_default_height) ?? 600;
        return { width, height };
    }

    /**
     * 元数据 `notechain.modal_size`：
     * - [w, h] 电脑和手机共用
     * - [pc_w, pc_h, mobile_w, mobile_h]
     * - { pc: [w, h], mobile: [w, h] } 或 { width, height }
     * 数值视为 px，也可用 `90vw` / `80%` 等 CSS 单位。
     */
    private parseModalSizeConfig(
        config: unknown,
        isMobile: boolean
    ): { width: number | string; height: number | string } | null {
        if (config == null) {
            return null;
        }

        if (Array.isArray(config)) {
            if (config.length === 2) {
                return this.pairSize(config[0], config[1]);
            }
            if (config.length >= 4) {
                return isMobile
                    ? this.pairSize(config[2], config[3])
                    : this.pairSize(config[0], config[1]);
            }
            return null;
        }

        if (typeof config !== 'object') {
            return null;
        }

        const obj = config as Record<string, unknown>;
        const device = isMobile ? (obj.mobile ?? obj.phone) : (obj.pc ?? obj.desktop);
        if (Array.isArray(device) && device.length >= 2) {
            const pair = this.pairSize(device[0], device[1]);
            if (pair) {
                return pair;
            }
        }
        if (device && typeof device === 'object' && !Array.isArray(device)) {
            const d = device as Record<string, unknown>;
            const pair = this.pairSize(d.width ?? d.w, d.height ?? d.h);
            if (pair) {
                return pair;
            }
        }
        if (isMobile) {
            const pair = this.pairSize(
                obj.mobile_width ?? obj.width ?? obj.w,
                obj.mobile_height ?? obj.height ?? obj.h
            );
            if (pair) {
                return pair;
            }
        }
        return this.pairSize(obj.width ?? obj.w, obj.height ?? obj.h);
    }

    private pairSize(
        width: unknown,
        height: unknown
    ): { width: number | string; height: number | string } | null {
        const w = this.normalizeSize(width);
        const h = this.normalizeSize(height);
        if (w == null || h == null) {
            return null;
        }
        return { width: w, height: h };
    }

    private normalizeSize(value: unknown): number | string | null {
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
            return value;
        }
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed) {
                return null;
            }
            const asNum = Number(trimmed);
            if (Number.isFinite(asNum) && asNum > 0) {
                return asNum;
            }
            if (/^\d+(\.\d+)?(px|vw|vh|dvh|svh|lvh|%|rem|em)$/i.test(trimmed)) {
                return trimmed;
            }
        }
        return null;
    }

    private applyModalSize(width: number | string, height: number | string) {
        const cssWidth = typeof width === 'number'
            ? `${Math.min(width, window.innerWidth)}px`
            : width;
        const cssHeight = typeof height === 'number'
            ? `${Math.min(height, window.innerHeight)}px`
            : height;
        this.modalEl.style.width = cssWidth;
        this.modalEl.style.height = cssHeight;
        this.modalEl.style.maxWidth = cssWidth;
        this.modalEl.style.maxHeight = cssHeight;
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
                    void this.openNoteInMainView(href);
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
            const message = error instanceof Error ? error.message : String(error);
            new Notice(`Error opening note: ${message}`);
        }
    }
}
