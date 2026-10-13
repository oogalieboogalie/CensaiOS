// HTML -> Writer blocks. Word files come in through mammoth as clean HTML
// (headings, paragraphs, lists, tables, pictures); this turns that HTML into
// the same blocks the editor makes, with bold, italic and links written as
// the editor's inline marks. Needs a DOMParser (browser or jsdom).

const HEADINGS = { H1: 'h1', H2: 'h2', H3: 'h3', H4: 'h3', H5: 'h3', H6: 'h3' };
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE']);

function wrapMark(marker, inner) {
  const text = inner.trim();
  if (!text) return inner;
  const lead = inner.slice(0, inner.indexOf(text[0]));
  const trail = inner.slice(inner.lastIndexOf(text[text.length - 1]) + 1);
  return `${lead}${marker}${text}${marker}${trail}`;
}

/** The text of an element with bold, italic, code and links as marks. */
export function inlineText(node) {
  let out = '';
  for (const child of node.childNodes) {
    if (child.nodeType === 3) { out += child.nodeValue.replace(/\s+/g, ' '); continue; }
    if (child.nodeType !== 1 || SKIP.has(child.tagName)) continue;
    const tag = child.tagName;
    if (tag === 'BR') { out += '\n'; continue; }
    if (tag === 'UL' || tag === 'OL' || tag === 'TABLE' || tag === 'IMG') continue;
    const inner = inlineText(child);
    if (tag === 'STRONG' || tag === 'B') out += wrapMark('**', inner);
    else if (tag === 'EM' || tag === 'I') out += wrapMark('*', inner);
    else if (tag === 'CODE') out += wrapMark('`', inner);
    else if (tag === 'A' && /^(https?:|mailto:)/i.test(child.getAttribute('href') || '') && inner.trim()) {
      out += `[${inner.trim()}](${child.getAttribute('href').replace(/[\s)]/g, encodeURIComponent)})`;
    } else out += inner;
  }
  return out;
}

const clean = (text) => text.replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').trim();

function pushImage(img, blocks) {
  const src = img.getAttribute('src') || '';
  if (src.startsWith('data:image/')) blocks.push({ type: 'image', src, alt: img.getAttribute('alt') || '' });
}

function imagesIn(node, blocks) {
  for (const img of node.querySelectorAll('img')) pushImage(img, blocks);
}

function listBlocks(list, blocks) {
  const type = list.tagName === 'OL' ? 'number' : 'bullet';
  for (const li of list.children) {
    if (li.tagName !== 'LI') continue;
    const text = clean(inlineText(li));
    if (text) blocks.push({ type, text });
    imagesIn(li, blocks);
    for (const sub of li.children) if (sub.tagName === 'UL' || sub.tagName === 'OL') listBlocks(sub, blocks);
  }
}

function tableBlock(table) {
  const rows = [];
  for (const tr of table.querySelectorAll('tr')) {
    if (tr.closest('table') !== table) continue;
    rows.push([...tr.children].filter((c) => c.tagName === 'TD' || c.tagName === 'TH').map((c) => clean(inlineText(c)).replace(/\n/g, ' ')));
  }
  // Word header rows are bold; the editor already shows row one as a header.
  if (rows[0]) rows[0] = rows[0].map((cell) => cell.replace(/^\*\*([^*]+)\*\*$/, '$1'));
  const width = Math.max(1, ...rows.map((r) => r.length));
  return rows.length ? { type: 'table', rows: rows.map((r) => [...r, ...Array(width - r.length).fill('')]) } : null;
}

function walk(parent, blocks) {
  for (const el of parent.children) {
    const tag = el.tagName;
    if (SKIP.has(tag)) continue;
    if (HEADINGS[tag]) {
      const text = clean(inlineText(el)).replace(/\n/g, ' ');
      if (text) blocks.push({ type: HEADINGS[tag], text: text.replace(/^\*\*(.*)\*\*$/, '$1') });
    } else if (tag === 'P') {
      const text = clean(inlineText(el));
      if (text) blocks.push({ type: 'p', text });
      imagesIn(el, blocks);
    } else if (tag === 'UL' || tag === 'OL') listBlocks(el, blocks);
    else if (tag === 'BLOCKQUOTE') {
      const text = clean(inlineText(el));
      if (text) blocks.push({ type: 'quote', text });
    } else if (tag === 'PRE') {
      const text = el.textContent.replace(/\n$/, '');
      if (text.trim()) blocks.push({ type: 'code', text });
    } else if (tag === 'TABLE') {
      const table = tableBlock(el);
      if (table) blocks.push(table);
    } else if (tag === 'HR') blocks.push({ type: 'divider' });
    else if (tag === 'IMG') pushImage(el, blocks);
    else walk(el, blocks);
  }
}

/** HTML string -> [{ type, text } | { type: 'table', rows } | { type: 'image', src, alt } | { type: 'divider' }]. */
export function htmlToBlocks(html, Parser = globalThis.DOMParser) {
  if (!Parser) throw new Error('Reading Word files needs a browser.');
  const dom = new Parser().parseFromString(`<body>${html}</body>`, 'text/html');
  const blocks = [];
  walk(dom.body, blocks);
  return blocks;
}
