// The Doc's read view drops markdown marks (**, [[ ]], "# ", "> "), so a
// letter on screen sits a few places away from the same letter in the file.
// This lines the shown letters up with the file's letters, so a note made
// on the screen is saved at its place in the file and painted back there.
// Bits drawn only for looks (list bullets, the code box's label and Copy
// button) carry data-md-decor and are left out.

const LOOKAHEAD = 64;

function shownTextNodes(container) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.parentElement?.closest('[data-md-decor], textarea') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
  return nodes;
}

/** Each shown text node with, per letter, that letter's place in `raw`. */
export function mapShownText(container, raw) {
  const map = [];
  let j = 0;
  for (const node of shownTextNodes(container)) {
    const shown = node.textContent;
    const at = new Array(shown.length);
    for (let i = 0; i < shown.length; i++) {
      let k = j;
      const stop = Math.min(raw.length, j + LOOKAHEAD);
      while (k < stop && raw[k] !== shown[i]) k++;
      if (k < stop) { at[i] = k; j = k + 1; } else at[i] = Math.min(j, raw.length);
    }
    map.push({ node, at });
  }
  return map;
}

/** The selected stretch of the read view as places in `raw`, or null. */
export function selectionToRaw(container, raw) {
  const sel = window.getSelection();
  if (!container || !sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;
  let start = Infinity, end = -1;
  for (const { node, at } of mapShownText(container, raw)) {
    if (!at.length || !range.intersectsNode(node)) continue;
    const s = node === range.startContainer ? range.startOffset : 0;
    const e = node === range.endContainer ? range.endOffset : at.length;
    if (s >= e) continue;
    start = Math.min(start, at[s]);
    end = Math.max(end, at[e - 1] + 1);
  }
  return end > start ? { start, end } : null;
}

/** The place in `raw` of the caret a click left in the read view, or null. */
export function caretToRaw(container, raw) {
  const sel = window.getSelection();
  if (!container || !sel || !sel.anchorNode) return null;
  const hit = mapShownText(container, raw).find((m) => m.node === sel.anchorNode);
  if (!hit || !hit.at.length) return null;
  return hit.at[Math.min(sel.anchorOffset, hit.at.length - 1)];
}

/** Screen ranges covering the places start..end of `raw`, one per text run. */
export function rawToRanges(map, start, end) {
  const ranges = [];
  for (const { node, at } of map) {
    let from = -1;
    for (let i = 0; i <= at.length; i++) {
      const inside = i < at.length && at[i] >= start && at[i] < end;
      if (inside && from < 0) from = i;
      if (!inside && from >= 0) {
        const range = document.createRange();
        range.setStart(node, from);
        range.setEnd(node, i);
        ranges.push(range);
        from = -1;
      }
    }
  }
  return ranges;
}

/** The place in `raw` under the pointer at x, y in the read view, or null. */
export function pointToRaw(container, raw, x, y) {
  const pos = document.caretPositionFromPoint?.(x, y);
  const range = pos ? null : document.caretRangeFromPoint?.(x, y);
  const node = pos ? pos.offsetNode : range?.startContainer;
  const offset = pos ? pos.offset : range?.startOffset;
  if (!container || !node || !container.contains(node)) return null;
  const hit = mapShownText(container, raw).find((m) => m.node === node);
  if (!hit || !hit.at.length) return null;
  return offset >= hit.at.length ? hit.at[hit.at.length - 1] + 1 : hit.at[offset];
}
