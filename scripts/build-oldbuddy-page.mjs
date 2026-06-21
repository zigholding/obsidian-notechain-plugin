/**
 * 将 src/server/oldbuddy 下的 HTML/CSS/JS 合并为 oldbuddyPageHtml.ts（打进 main.js，无需 index.html）
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = 'src/server/oldbuddy';
const OUT = 'src/server/oldbuddyPageHtml.ts';

function read(rel) {
    return readFileSync(join(ROOT, rel), 'utf8');
}

function escapeTsTemplate(s) {
    return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

const indexHtml = read('index.html');
const extraStyleMatch = indexHtml.match(/<style>([\s\S]*?)<\/style>/i);
const extraStyle = extraStyleMatch ? extraStyleMatch[1].trim() : '';
const bodyMatch = indexHtml.match(/<body>([\s\S]*?)<\/body>/i);
let body = bodyMatch ? bodyMatch[1] : '';
body = body.replace(/<script\s+src="[^"]*"><\/script>\s*/gi, '');

const style = read('style.css');
const scripts = [
    read('js/websocket.js'),
    read('js/markdown.js'),
    read('js/message.js'),
    read('js/avatars.js'),
    read('js/quick_commands.js'),
    read('js/reference.js'),
    read('js/upload.js'),
].join('\n\n');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>OldBuddy 老友聊天</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <style>
${style}
${extraStyle}
    </style>
</head>
<body>
${body.trim()}
<script>
${scripts}
</script>
</body>
</html>`;

const ts = `/** 由 scripts/build-oldbuddy-page.mjs 生成，请勿手改 */
export const OLDBUDDY_PAGE_HTML = \`${escapeTsTemplate(html)}\`;
`;

writeFileSync(OUT, ts, 'utf8');
console.log('[oldbuddy] wrote', OUT);
