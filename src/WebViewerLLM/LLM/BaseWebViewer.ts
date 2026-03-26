
import { App, View, WorkspaceLeaf, Notice } from 'obsidian';

export class BaseWebViewer {
    app: App;
    homepage: any;
    view: View | null; // Declare the type of view
    name: string;

    constructor(app: App, homepage: string = '', name: string = '') {
        this.app = app;
        this.homepage = homepage;
        this.view = this.get_webviews(this.homepage)[0];
        this.name = name;
    }

    get allLeaves() {
        let leaves: Array<WorkspaceLeaf> = [];
        this.app.workspace.iterateAllLeaves(x => {
            leaves.push(x);
        });
        return leaves;
    }

    get allViews() {
        return this.allLeaves.map(
            x => x.view
        )
    }

    // 所有 webview 标签
    get leaves() {
        let leaves = this.allLeaves.filter(
            x => (x.view as any).webview
        );
        return leaves;
    }

    // 所有 webview 视图
    get views() {
        return this.leaves.map(
            x => x.view
        )
    }

    get activeLeaf() {
        let leaves = this.leaves.filter(
            x => (x as any).containerEl.className.contains('mod-active')
        );
        if (leaves.length != 1) {
            return null;
        } else {
            return leaves[0];
        }
    }

    get activeView() {
        let leaf = this.activeLeaf;
        if (leaf) {
            return leaf.view;
        } else {
            return null;
        }
    }

    get webviews_blank() {
        return this.get_webviews('about:blank');
    }

    get webview() {
        if (this.view) {
            return (this.view as any).webview;
        } else {
            return null;
        }
    }

    // 获取指定标签
    get_webviews(prefix: string) {
        return this.views.filter(
            (x: any) => x?.url?.startsWith(prefix)
        )
    }

    async open_homepage(url = this.homepage, idx = 0) {
        let views = this.get_webviews(url);
        if (idx == -1) {
            idx = views.length;
        }
        let n = views.length;
        while (n < idx + 1) {
            let plugin = (this.app as any).internalPlugins.getEnabledPluginById("webviewer");
            if(plugin){
                await plugin.openUrl(url,true);
                n = n + 1;
            }else{
                break;
            }
        }
        views = this.get_webviews(url);
        if (views.length >= idx + 1) {
            return views[idx];
        } else {
            return null;
        }
    }


    async set_homepage(url = this.homepage, idx = 0) {
        this.view = await this.open_homepage(url, idx);
    }

    async source(view = this.view) {
        if (!view || !(view as any).webview) { return ''; }
        let html = await (view as any).webview.executeJavaScript(`document.documentElement.outerHTML`);
        return html;
    }

    async document(view = this.view) {
        let html = await this.source(this.view);
        let doc = this.html_to_dom(html);
        return doc;
    }

    html_to_dom(html: string) {
        let parser = new DOMParser();
        let dom = parser.parseFromString(html, "text/html");
        return dom;
    }
    
    async html_to_markdown(html: string): Promise<string> {
        const nc = (this.app as any).plugins.plugins['note-chain'];
        const md = nc?.webViewerLLM ? await nc.webViewerLLM.html_to_markdown(html) : '';
        return md;
    }

    async delay(ms: number) {
        return new Promise(resolve => {
            setTimeout(resolve, ms);
        });
    }

    setActiveLeaf(view = this.view) {
        if (!view) { return };
        let leaf = this.allLeaves.filter(x => x.view == view)[0];
        if (!leaf) { return };
        this.app.workspace.setActiveLeaf(leaf);
    }

    get_safe_ctx(ctx: string) {
        let safeCtx = JSON.stringify(ctx.replace(/`/g, '~').replace(/\$/g, '￥'));
        return safeCtx.slice(1, safeCtx.length - 1);
    }


    async paste_msg(ctx: string) {

    }

    async click_btn_of_send() {

    }

    async number_of_receive_msg() {
        return 0;
    }

    async get_last_content() {
        return '';
    }

    async copy_last_content() {
        return false;
    }

    async probe_action_elements() {
        if (!this.webview) {
            return null;
        }
        const result = await this.webview.executeJavaScript(
            `
            (() => {
                const toBrief = (el) => {
                    if (!el) return null;
                    const attrs = {};
                    const keys = ['id', 'class', 'name', 'role', 'type', 'data-testid', 'aria-label', 'placeholder'];
                    for (const key of keys) {
                        const v = el.getAttribute?.(key);
                        if (v) attrs[key] = v;
                    }
                    return {
                        tag: el.tagName?.toLowerCase?.() || '',
                        text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 80),
                        attrs
                    };
                };
                const pick = (selectors) => {
                    for (const selector of selectors) {
                        const el = document.querySelector(selector);
                        if (el) return { selector, element: toBrief(el) };
                    }
                    return null;
                };
                const inputs = [
                    'textarea',
                    '[contenteditable="true"]',
                    'div#prompt-textarea.ProseMirror',
                    '.ProseMirror',
                    '.ql-editor[contenteditable="true"]'
                ];
                const sends = [
                    'button#composer-submit-button',
                    'button[aria-label*="Send"]',
                    'button[aria-label*="发送"]',
                    'button.send-button',
                    'button.send-button.submit',
                    '[role="button"][aria-label*="Send"]',
                    '[role="button"][aria-label*="发送"]',
                    '#flow-end-msg-send',
                    'a[class^="style__send-btn"]'
                ];
                const copies = [
                    'button[data-testid*="copy"]',
                    '[class*="copy"]',
                    '[aria-label*="Copy"]',
                    '[aria-label*="复制"]',
                    '.segment-actions-content-btn'
                ];
                return {
                    url: location.href,
                    input: pick(inputs),
                    send: pick(sends),
                    copy: pick(copies)
                };
            })()
            `
        );
        return result;
    }

    async request(ctx: string, timeout = 120) {

        let N1 = await this.number_of_receive_msg();
        await this.paste_msg(ctx);
        await this.delay(1000);
        await this.click_btn_of_send();
        let N2 = await this.number_of_receive_msg();

        while (N2 != N1 + 1) {
            await this.delay(1000);
            N2 = await this.number_of_receive_msg();
            timeout = timeout - 1;
            if (timeout < 0) {
                break;
            }
        }

        if (N2 == N1 + 1) {
            let ctx = await this.get_last_content();
            new Notice(`${this.name} 说了点什么`)
            return ctx;
        } else {
            new Notice(`${this.name} 不说话`)
            console.log(this.name, N1, N2)
            return null;
        }
    }

} 