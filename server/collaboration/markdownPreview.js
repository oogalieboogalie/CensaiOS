// A small, safe markdown-to-HTML pass for the chat live preview. Everything
// is escaped first, so a note can never inject markup; only the common
// shapes (headings, lists, quotes, code, links, images, bold, italic, rules)
// come back as tags. The page then renders inside a sandboxed iframe.

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function safeUrl(url) {
  const value = String(url || '').trim();
  return /^(https?:|mailto:|#|\.{0,2}\/|data:image\/)/i.test(value) || !/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : '#';
}

function inline(text) {
  const codes = [];
  let out = escapeHtml(text).replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code);
    return `@@code${codes.length - 1}@@`;
  });
  out = out
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) => `<img alt="${alt}" src="${safeUrl(url)}">`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => `<a href="${safeUrl(url)}" target="_blank" rel="noreferrer">${label}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');
  return out.replace(/@@code(\d+)@@/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
}

/** Markdown text -> HTML body fragment. */
export function markdownToHtml(markdown) {
  const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let para = [];
  let list = null;
  const flushPara = () => { if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`); para = []; };
  const flushList = () => { if (list) out.push(`<${list.tag}>${list.items.map((item) => `<li>${inline(item)}</li>`).join('')}</${list.tag}>`); list = null; };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const fence = /^```\s*([\w-]*)/.exec(line);
    if (fence) {
      flushPara(); flushList();
      const body = [];
      for (i += 1; i < lines.length && !/^```/.test(lines[i]); i += 1) body.push(lines[i]);
      out.push(`<pre><code>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (heading) { flushPara(); flushList(); out.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`); }
    else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flushPara(); flushList(); out.push('<hr>'); }
    else if (/^>\s?/.test(line)) { flushPara(); flushList(); out.push(`<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`); }
    else if (bullet || numbered) {
      flushPara();
      const tag = bullet ? 'ul' : 'ol';
      if (list && list.tag !== tag) flushList();
      if (!list) list = { tag, items: [] };
      list.items.push((bullet || numbered)[1]);
    } else if (!line.trim()) { flushPara(); flushList(); }
    else { flushList(); para.push(line.trim()); }
  }
  flushPara(); flushList();
  return out.join('\n');
}
