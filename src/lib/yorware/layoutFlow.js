// Text flow for YorWare Layout. A story is one run of text; it fills its
// frames in order (and each frame's columns left to right), so a newsletter
// article can start on page 1 and carry on on page 3. Line breaks are worked
// out with the PDF standard fonts' own character widths, so the screen and
// the exported PDF break every line in the same place.
import { METRIC_CHARS, METRIC_WIDTHS } from './layoutMetrics.js';

export const FONTS = Object.freeze({
  sans: { label: 'Sans', css: 'Helvetica, Arial, "Liberation Sans", sans-serif' },
  serif: { label: 'Serif', css: '"Times New Roman", Times, "Liberation Serif", serif' },
  mono: { label: 'Mono', css: '"Courier New", Courier, "Liberation Mono", monospace' },
});
export const COLUMN_GAP = 14;
// Where the first baseline sits below the top of a line, as a share of the
// font size. Screen and PDF both draw at this baseline.
export const ASCENT = 0.8;

const INDEX = new Map(Array.from(METRIC_CHARS).map((ch, i) => [ch, i]));

/** The metrics key for a story's font: sans | sansBold | serif | … */
export function fontKey(story) {
  const base = FONTS[story?.font] ? story.font : 'sans';
  return story?.bold ? `${base}Bold` : base;
}

/** Characters the PDF fonts can't print become "?"; tabs become spaces. */
export function printableText(text) {
  return Array.from(String(text ?? '').replace(/\r\n?/g, '\n').replace(/\t/g, '    '))
    .map((ch) => (ch === '\n' || INDEX.has(ch) ? ch : ch === ' ' ? ' ' : '?')).join('');
}

/** Width of a line of (printable) text in points. */
export function textWidth(text, key, size) {
  const widths = METRIC_WIDTHS[key] || METRIC_WIDTHS.sans;
  let units = 0;
  for (const ch of text) units += widths[INDEX.get(ch)] ?? 500;
  return (units * size) / 1000;
}

/** Break one paragraph into lines no wider than `width`. */
export function wrapParagraph(para, width, key, size) {
  if (!para) return [''];
  const lines = [];
  let line = '';
  const fits = (t) => textWidth(t, key, size) <= width;
  for (const word of para.split(/(?<= )/)) {
    if (fits(line + word.replace(/ $/, ''))) { line += word; continue; }
    if (line) { lines.push(line.replace(/ +$/, '')); line = ''; }
    let rest = word;
    // A word wider than the frame is split wherever it has to be.
    while (!fits(rest.replace(/ $/, '')) && rest.length > 1) {
      let n = rest.length - 1;
      while (n > 1 && !fits(rest.slice(0, n))) n -= 1;
      lines.push(rest.slice(0, n));
      rest = rest.slice(n);
    }
    line = rest;
  }
  lines.push(line.replace(/ +$/, ''));
  return lines;
}

/** The rectangles text runs into for one frame: its columns, left to right. */
export function frameSlots(frame) {
  const cols = Math.max(1, Math.min(4, Number(frame.cols) || 1));
  const pad = Number(frame.pad) || 0;
  const inner = { x: frame.x + pad, y: frame.y + pad, w: Math.max(1, frame.w - pad * 2), h: Math.max(1, frame.h - pad * 2) };
  const colW = (inner.w - COLUMN_GAP * (cols - 1)) / cols;
  return Array.from({ length: cols }, (_, i) => ({ x: inner.x + i * (colW + COLUMN_GAP), y: inner.y, w: Math.max(1, colW), h: inner.h }));
}

/**
 * Lay a story out across its frames. Returns
 *   { frames: { [frameId]: [{ text, x, y }] }, overflow, hiddenWords }
 * where x, y is each line's baseline start in page points. `overflow` is
 * true when text is left over after the last frame.
 */
export function flowStory(story, frames, { pageNo, pages } = {}) {
  let text = printableText(story?.text);
  if (pageNo !== undefined) text = text.replace(/\{page\}/g, String(pageNo)).replace(/\{pages\}/g, String(pages ?? ''));
  const size = Math.max(4, Number(story?.size) || 12);
  const lineH = size * Math.max(0.8, Number(story?.lead) || 1.25);
  const key = fontKey(story);
  const align = story?.align || 'left';
  const out = { frames: {}, overflow: false, hiddenWords: 0 };
  const paragraphs = text.split('\n');
  let pi = 0;
  let pending = null;
  for (const { id, frame } of frames) {
    out.frames[id] = [];
    for (const slot of frameSlots(frame)) {
      let y = 0;
      // Lines left over from a narrower or wider column are broken again.
      if (pending?.length) pending = wrapParagraph(pending.join(' '), slot.w, key, size);
      while (pi < paragraphs.length || pending?.length) {
        if (!pending?.length) { pending = wrapParagraph(paragraphs[pi], slot.w, key, size); pi += 1; }
        if (y + lineH > slot.h + 0.01) break;
        const line = pending.shift();
        const w = textWidth(line, key, size);
        const dx = align === 'center' ? (slot.w - w) / 2 : align === 'right' ? slot.w - w : 0;
        out.frames[id].push({ text: line, x: slot.x + dx, y: slot.y + y + size * ASCENT });
        y += lineH;
      }
    }
  }
  const left = [...(pending || []), ...paragraphs.slice(pi)].join(' ').trim();
  if (left) {
    out.overflow = true;
    out.hiddenWords = left.split(/\s+/).filter(Boolean).length;
  }
  return out;
}
