// static/js/markdown.js
// 聊天气泡用 Markdown 子集渲染（先转义再解析，降低 XSS 风险）
// 支持：标题 # / ## / ###、引用 >、分隔线 ---、粗斜体、行内代码、围栏代码块、链接、列表、删除线 ~~

(function () {
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderInline(s) {
    const linkPlaceholders = [];
    const codePlaceholders = [];

    // Links: [text](url)
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, text, url) => {
      const key = `@@MDLINKPLACEHOLDER${linkPlaceholders.length}@@`;
      linkPlaceholders.push(
        `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`
      );
      return key;
    });
    // Autolink: https://...
    s = s.replace(/(https?:\/\/[^\s<]+)/g, (m, url) => {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });

    // Inline code: `code` (placeholder so bold/italic passes skip it)
    s = s.replace(/`([^`\n]+)`/g, (m, code) => {
      const key = `@@MDCODEPLACEHOLDER${codePlaceholders.length}@@`;
      codePlaceholders.push(`<code>${code}</code>`);
      return key;
    });

    // Strikethrough: ~~text~~
    s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");

    // Bold: **text** or __text__
    s = s.replace(/\*\*([^\n*][\s\S]*?[^\n*])\*\*/g, "<strong>$1</strong>");
    s = s.replace(/__([^\n_][\s\S]*?[^\n_])__/g, "<strong>$1</strong>");

    // Italic: *text* or _text_ (skip _bsf_-like ASCII identifiers)
    s = s.replace(/(^|[^\*])\*([^\n*]+)\*(?!\*)/g, "$1<em>$2</em>");
    s = s.replace(/(^|[^_\w])_([^\n_]+)_(?![_\w])/g, (m, prefix, inner) => {
      if (/^[A-Za-z0-9_]+$/.test(inner)) return m;
      return `${prefix}<em>${inner}</em>`;
    });

    codePlaceholders.forEach((html, idx) => {
      s = s.replaceAll(`@@MDCODEPLACEHOLDER${idx}@@`, html);
    });

    // Restore markdown link placeholders (avoid autolink touching href attributes)
    linkPlaceholders.forEach((html, idx) => {
      s = s.replaceAll(`@@MDLINKPLACEHOLDER${idx}@@`, html);
    });

    return s;
  }

  function renderMarkdown(md) {
    const raw = md == null ? "" : String(md);
    const src = raw.replace(/\r\n/g, "\n");

    const blocks = [];
    const withPlaceholders = src.replace(/```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g, (m, lang, code) => {
      const safeCode = escapeHtml(code).replace(/\n$/, "");
      const safeLang = lang ? String(lang) : "";
      const html = `<pre><code${safeLang ? ` class="lang-${escapeHtml(safeLang)}"` : ""}>${safeCode}</code></pre>`;
      const key = `@@CODEBLOCK_${blocks.length}@@`;
      blocks.push({ key, html });
      return key;
    });

    let safe = escapeHtml(withPlaceholders);
    const lines = safe.split("\n");
    let out = "";
    let inUl = false;
    let inOl = false;
    let inBq = false;

    function closeLists() {
      if (inUl) { out += "</ul>"; inUl = false; }
      if (inOl) { out += "</ol>"; inOl = false; }
    }

    function closeBlockquote() {
      if (inBq) { out += "</blockquote>"; inBq = false; }
    }

    function closeAllBlocks() {
      closeLists();
      closeBlockquote();
    }

    for (const line of lines) {
      if (/^@@CODEBLOCK_\d+@@$/.test(line.trim())) {
        closeAllBlocks();
        out += line.trim();
        continue;
      }

      if (inBq && line.trim() === "") {
        closeBlockquote();
        continue;
      }

      if (/^\s*(?:---+|\*\*\*+)\s*$/.test(line)) {
        closeAllBlocks();
        out += '<hr class="md-hr">';
        continue;
      }

      const hm = line.match(/^\s*(#{1,3})\s+(.+)$/);
      if (hm) {
        closeAllBlocks();
        const lvl = hm[1].length;
        out += `<h${lvl} class="md-h md-h${lvl}">${renderInline(hm[2])}</h${lvl}>`;
        continue;
      }

      const bq = line.match(/^\s*>\s?(.*)$/);
      if (bq) {
        closeLists();
        if (!inBq) { out += '<blockquote class="md-blockquote">'; inBq = true; }
        const inner = bq[1];
        if (inner.trim() === "") {
          out += "<br>";
        } else {
          out += `<div class="md-line md-bq-line">${renderInline(inner)}</div>`;
        }
        continue;
      }

      closeBlockquote();

      const ul = line.match(/^\s*[-*]\s+(.*)$/);
      const ol = line.match(/^\s*(\d+)\.\s+(.*)$/);

      if (ul) {
        if (inOl) { out += "</ol>"; inOl = false; }
        if (!inUl) { out += "<ul>"; inUl = true; }
        out += `<li>${renderInline(ul[1])}</li>`;
        continue;
      }
      if (ol) {
        if (inUl) { out += "</ul>"; inUl = false; }
        if (!inOl) { out += "<ol>"; inOl = true; }
        out += `<li>${renderInline(ol[2])}</li>`;
        continue;
      }

      closeLists();
      if (line.trim() === "") {
        out += "<br>";
      } else {
        out += `<div class="md-line">${renderInline(line)}</div>`;
      }
    }
    closeAllBlocks();

    for (const b of blocks) {
      out = out.replaceAll(b.key, b.html);
    }

    return out;
  }

  window.renderMarkdown = renderMarkdown;
})();
