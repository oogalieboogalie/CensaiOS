// Censai Slides model: a deck is an ordered list of 16:9 slides. The order
// and theme are the `officeDeck` window field; each slide is a part (see
// officeParts.js). Block boxes are in percent of the slide, so the same
// numbers drive the editor, the present mode, .pptx and .pdf. Pure, no React.
//
//   slide  { layout, blocks: [block], notes, at }
//   block  { id, type: 'text', role, x, y, w, h, text, size, bold, align }
//          { id, type: 'image', x, y, w, h, src, alt }
//   text   one paragraph per line; a line starting "- " is a bullet
import { PART, newPartId, orderedIds, partKey, readParts } from './officeParts.js';

export const SLIDE_W_IN = 10;
export const SLIDE_H_IN = 5.625;
export const SLIDE_W_PT = SLIDE_W_IN * 72;

// Colours as hex without '#', the form .pptx wants.
export const THEMES = Object.freeze({
  censai: { label: 'censaiOS', bg: '0E0E0E', ink: 'EAEAEA', soft: '929292', accent: 'E5A83A' },
  paper: { label: 'Paper', bg: 'F5F5F2', ink: '141414', soft: '5E5E5A', accent: '8A5D00' },
});

// The thin accent mark every slide carries (percent of the slide).
export const ACCENT_BAR = Object.freeze({ x: 6, y: 92, w: 5, h: 0.9 });

export const LAYOUTS = Object.freeze({
  title: 'Title',
  titleBody: 'Title and text',
  section: 'Section',
  blank: 'Blank',
});

const text = (role, box, fields) => ({ id: newPartId('t'), type: 'text', role, ...box, text: '', align: 'left', bold: false, ...fields });

export function makeSlide(layout = 'titleBody', fields = {}) {
  const blocks = {
    title: [
      text('title', { x: 8, y: 32, w: 84, h: 20 }, { size: 40, bold: true, align: 'center', text: fields.title || '' }),
      text('subtitle', { x: 16, y: 55, w: 68, h: 12 }, { size: 18, align: 'center', text: fields.subtitle || '' }),
    ],
    titleBody: [
      text('title', { x: 6, y: 7, w: 88, h: 16 }, { size: 30, bold: true, text: fields.title || '' }),
      text('body', { x: 6, y: 27, w: 88, h: 64 }, { size: 18, text: fields.body || '' }),
    ],
    section: [
      text('title', { x: 8, y: 40, w: 84, h: 18 }, { size: 36, bold: true, text: fields.title || '' }),
    ],
    blank: [],
  }[layout] || [];
  return { layout, blocks, notes: '', at: Date.now() };
}

export function readDeck(win) {
  const slides = readParts(win, PART.slide);
  const theme = THEMES[win?.officeDeck?.theme] ? win.officeDeck.theme : 'censai';
  return { order: orderedIds(win?.officeDeck?.order, slides), slides, theme };
}

export function slideKey(id) {
  return partKey(PART.slide, id);
}

export function deckMeta(deck, change = {}) {
  return { officeDeck: { order: deck.order, theme: deck.theme, ...change } };
}

export function insertSlidePatch(deck, afterId, slide) {
  const id = newPartId('sl');
  const at = afterId ? deck.order.indexOf(afterId) + 1 : deck.order.length;
  const order = [...deck.order.slice(0, at), id, ...deck.order.slice(at)];
  return { id, patch: { ...deckMeta(deck, { order }), [slideKey(id)]: slide } };
}

export function removeSlidePatch(deck, id) {
  return { ...deckMeta(deck, { order: deck.order.filter((x) => x !== id) }), [slideKey(id)]: null };
}

export function moveSlidePatch(deck, id, delta) {
  const i = deck.order.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= deck.order.length) return null;
  const order = [...deck.order];
  [order[i], order[j]] = [order[j], order[i]];
  return deckMeta(deck, { order });
}

export function updateBlock(slide, blockId, change) {
  return { ...slide, blocks: slide.blocks.map((b) => (b.id === blockId ? { ...b, ...change } : b)) };
}

export function clampBox({ x, y, w, h }) {
  const cw = Math.min(100, Math.max(4, w));
  const ch = Math.min(100, Math.max(4, h));
  return { x: Math.min(100 - cw, Math.max(0, x)), y: Math.min(100 - ch, Math.max(0, y)), w: cw, h: ch };
}

/** "- a\nplain" -> [{ text: 'a', bullet: true }, { text: 'plain' }] */
export function textLines(value) {
  return String(value || '').split('\n').map((line) => {
    const m = /^\s*[-*•]\s+(.*)$/.exec(line);
    return m ? { text: m[1], bullet: true } : { text: line, bullet: false };
  });
}

export function blockColor(block, theme) {
  const t = THEMES[theme] || THEMES.censai;
  return block.role === 'subtitle' ? t.soft : t.ink;
}
