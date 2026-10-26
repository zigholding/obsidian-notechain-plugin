// static/js/markdown.js
// 聊天气泡用 Markdown 子集渲染（先转义再解析，降低 XSS 风险）
// 支持：标题 # / ## / ###、引用 >、分隔线 ---、粗斜体、行内代码、围栏代码块、链接、列表、删除线 ~~、GFM 表格

(function () {
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  const VIDEO_URL_RE = /\.(mp4|mov|m4v|mkv|3gp|webm)(\?|#|$)/i;

  function isVideoUrl(url) {
    return VIDEO_URL_RE.test(String(url || ""));
  }

  function videoTag(url) {
    const safe = escapeHtml(url);
    return `<video class="md-video" controls playsinline preload="metadata" src="${safe}"></video>`;
  }

  function renderInline(s) {
    const linkPlaceholders = [];
    const codePlaceholders = [];

    // Video: ![video](url) or [video](url)
    s = s.replace(/!\[video\]\(([^\s)]+)\)/gi, (m, url) => videoTag(url));
    s = s.replace(/\[video\]\(([^\s)]+)\)/gi, (m, url) => videoTag(url));

    // Links: [text](url) — 视频 URL 渲染为播放器
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, text, url) => {
      if (isVideoUrl(url)) return videoTag(url);
      const key = `@@MDLINKPLACEHOLDER${linkPlaceholders.length}@@`;
      linkPlaceholders.push(
        `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`
      );
      return key;
    });
    // 相对路径 /oldbuddy/uploads/…
    s = s.replace(/\[([^\]]+)\]\((\/oldbuddy\/[^\s)]+)\)/g, (m, text, url) => {
      if (isVideoUrl(url)) return videoTag(url);
      const key = `@@MDLINKPLACEHOLDER${linkPlaceholders.length}@@`;
      linkPlaceholders.push(
        `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`
      );
      return key;
    });
    // Autolink: https://... — 视频直链嵌入播放器
    s = s.replace(/(https?:\/\/[^\s<]+)/g, (m, url) => {
      if (isVideoUrl(url)) return videoTag(url);
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

  /** 按未转义的 `|` 分列。行内代码里的 `|` 与 `\|` 不当作分隔。 */
  function splitTableRow(line) {
    let text = line.trim();
    if (text.startsWith("|")) text = text.slice(1);
    if (text.endsWith("|")) text = text.slice(0, -1);
    const cells = [];
    let cur = "";
    let inCode = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === "`") {
        inCode = !inCode;
        cur += ch;
        continue;
      }
      if (!inCode && ch === "\\" && text[i + 1] === "|") {
        cur += "|";
        i++;
        continue;
      }
      if (!inCode && ch === "|") {
        cells.push(cur.trim());
        cur = "";
        continue;
      }
      cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  }

  function isSeparatorLine(line) {
    if (!line.includes("|")) return false;
    const cells = splitTableRow(line);
    if (!cells.length) return false;
    return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
  }

  function tableAlignClass(cell) {
    const text = String(cell || "").trim();
    const left = text.startsWith(":");
    const right = text.endsWith(":");
    if (left && right) return "md-align-center";
    if (right) return "md-align-right";
    return "";
  }

  function isTableStart(headerLine, sepLine) {
    if (!headerLine || !sepLine) return false;
    if (!headerLine.includes("|") || isSeparatorLine(headerLine)) return false;
    return isSeparatorLine(sepLine);
  }

  function renderTable(lines, start) {
    const header = splitTableRow(lines[start]);
    const sep = splitTableRow(lines[start + 1]);
    const cols = Math.max(header.length, sep.length);
    const aligns = [];
    for (let c = 0; c < cols; c++) aligns.push(tableAlignClass(sep[c] || ""));
    let html = '<div class="md-table-wrap"><table class="md-table"><thead><tr>';
    for (let c = 0; c < cols; c++) {
      const cls = aligns[c] ? ` class="${aligns[c]}"` : "";
      html += `<th${cls}>${renderInline(header[c] || "")}</th>`;
    }
    html += "</tr></thead><tbody>";
    let row = start + 2;
    for (; row < lines.length; row++) {
      const rowLine = lines[row];
      if (rowLine.trim() === "" || !rowLine.includes("|")) break;
      if (/^\s*(#{1,3})\s+/.test(rowLine)) break;
      if (/^\s*(?:---+|\*\*\*+)\s*$/.test(rowLine)) break;
      if (/^@@CODEBLOCK_\d+@@$/.test(rowLine.trim())) break;
      const cells = splitTableRow(rowLine);
      html += "<tr>";
      for (let c = 0; c < cols; c++) {
        const cls = aligns[c] ? ` class="${aligns[c]}"` : "";
        html += `<td${cls}>${renderInline(cells[c] || "")}</td>`;
      }
      html += "</tr>";
    }
    html += "</tbody></table></div>";
    return { html, next: row };
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

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isTableStart(line, lines[i + 1])) {
        closeAllBlocks();
        const table = renderTable(lines, i);
        out += table.html;
        i = table.next - 1;
        continue;
      }

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
  window.appendTrustedHtml = function (el, html) {
    const parsed = new DOMParser().parseFromString(String(html || ""), "text/html");
    el.append(...Array.from(parsed.body.childNodes));
  };
})();
