export function getSelectionOffsets(container) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  let start = -1, end = -1, offset = 0, node;
  while ((node = walker.nextNode())) {
    const len = node.textContent.length;
    if (node === range.startContainer) start = offset + range.startOffset;
    if (node === range.endContainer) end = offset + range.endOffset;
    offset += len;
  }
  if (start < 0 || end < 0) return null;
  if (start > end) [start, end] = [end, start];
  if (start === end) return null;
  return { start, end };
}

export function parseOutlinks(text) {
  const matches = (text || '').match(/\[\[(.*?)\]\]/g) || [];
  return matches.map(m => {
    const name = m.slice(2, -2);
    return { name, path: name.includes('.') ? name : `${name}.md` };
  });
}

export function splitByAnnotations(text, annotations) {
  if (!annotations || !annotations.length) return [{ text }];
  const sorted = [...annotations].sort((a, b) => a.start - b.start);
  const segments = []; let cursor = 0;
  for (const ann of sorted) {
    const s = Math.max(cursor, ann.start);
    if (s > cursor) segments.push({ text: text.slice(cursor, s) });
    if (ann.end > s) segments.push({ text: text.slice(s, ann.end), ann });
    cursor = Math.max(cursor, ann.end);
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}
