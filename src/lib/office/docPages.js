// YorWare Writer pages: Letter or A4 sheets with one-inch margins, the same
// on screen, in the PDF and in the Word file. The page size is the `docPage`
// window field ('letter' or 'a4'); without it the document flows with no
// pages, as older Censai Docs did. Pure, no React.
import { plainText } from './docModel.js';

export const CSS_DPI = 96;
export const MARGIN_IN = 1;
/** The grey band between two sheets on screen, in CSS pixels. */
export const PAGE_GAP = 24;

export const PAGE_SIZES = Object.freeze({
  letter: { id: 'letter', label: 'Letter', wIn: 8.5, hIn: 11, pdf: 'letter', twips: { width: 12240, height: 15840 } },
  a4: { id: 'a4', label: 'A4', wIn: 8.27, hIn: 11.69, pdf: 'a4', twips: { width: 11906, height: 16838 } },
});

/** The page size of a window, or null for the old flowing view. */
export function pageSizeOf(win) {
  return PAGE_SIZES[win?.docPage] || null;
}

/** Sheet geometry in CSS pixels. */
export function pageBox(size) {
  const margin = MARGIN_IN * CSS_DPI;
  const width = Math.round(size.wIn * CSS_DPI);
  const height = Math.round(size.hIn * CSS_DPI);
  return { width, height, margin, contentHeight: height - margin * 2 };
}

/**
 * Where page breaks fall. `items` are the rows in order with their natural
 * `top` and `height` (no breaks drawn yet), measured from the top of the
 * writing area. A row that would cross the bottom of a page moves to the
 * next one, taking a heading just above it along; a row taller than a
 * page starts a page and runs over.
 * Returns { breaks: { id: px of page left blank above it }, pages, tail }
 * where `tail` is the blank space after the last row on the last page.
 */
export function planPageBreaks(items, contentHeight) {
  const breaks = {};
  let shift = 0;
  let pageTop = 0;
  let pages = 1;
  let bottom = 0;
  let prev = null;
  for (const item of items) {
    const { id, top, height } = item;
    const at = top + shift;
    if (at + height > pageTop + contentHeight && at > pageTop + 0.5) {
      // A heading never sits alone at the foot of a page: it moves down too.
      const prevAt = prev ? prev.top + shift : 0;
      const carry = prev?.keepWithNext && prevAt > pageTop + 0.5;
      const blank = pageTop + contentHeight - (carry ? prevAt : at);
      breaks[carry ? prev.id : id] = Math.max(0, Math.round(blank));
      shift += Math.max(0, blank);
      pageTop += contentHeight;
      pages += 1;
    }
    prev = item;
    bottom = top + shift + height;
    while (bottom > pageTop + contentHeight + 0.5) { pageTop += contentHeight; pages += 1; }
  }
  return { breaks, pages, tail: Math.max(0, Math.round(pageTop + contentHeight - bottom)) };
}

/** Words in the document, counting every text block and table cell. */
export function countWords(doc, title = '') {
  const texts = [title];
  for (const id of doc.order) {
    const b = doc.blocks[id];
    if (b?.rows) b.rows.forEach((row) => row.forEach((cell) => texts.push(plainText(cell))));
    else texts.push(plainText(b?.text));
  }
  return texts.join(' ').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}
