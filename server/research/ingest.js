// CHUNK AND TAG (Alex's diagram 13): anything fed into the board's knowledge
// base is cut into pieces and every piece gets tags, so an agent can find the
// right piece later. "5 steps to cleaning dogs" becomes five step chunks, all
// tagged dog, washing, cleaning, how-to. Pure functions, no key needed.

import { chunkText, tokenize } from './retrieve.js';

const MAX_TAGS = 6;
const STEP_LINE = /^\s*(?:(?:step\s*)?(\d{1,2})[.):]|step\s+(\d{1,2})\b|#{1,3}\s+\S)/i;
const EXTRA_STOP = new Set(('about after also any can could do does each get got just like make more most much need '
  + 'not now one only other our out over same should some such than then them these thing things those through '
  + 'too two under up use used using very want way well while would yes all been being both off own here').split(' '));

function words(text) {
  return tokenize(text).filter((w) => w.length > 2 && !EXTRA_STOP.has(w) && !/^\d+$/.test(w));
}

/** Plain text from a file: HTML loses its tags, everything else stays. */
export function fileText(name, raw) {
  const text = String(raw || '');
  if (!/\.html?$/i.test(String(name || ''))) return text;
  return text
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|br)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

/**
 * Split on numbered steps or headings ("1.", "Step 2", "## Rinse"). Returns
 * null when the text has fewer than two, so ordinary prose uses chunkText.
 */
export function splitSteps(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const starts = lines.map((line, i) => (STEP_LINE.test(line) ? i : -1)).filter((i) => i >= 0);
  if (starts.length < 2) return null;
  const intro = lines.slice(0, starts[0]).join('\n').trim();
  const steps = starts.map((start, n) => lines.slice(start, starts[n + 1] ?? lines.length).join('\n').trim())
    .filter(Boolean);
  return { intro, steps };
}

/** Up to MAX_TAGS words that say what a piece is about (title words count double). */
export function tagText(text, { title = '', extra = [] } = {}) {
  const counts = new Map();
  for (const w of words(text)) counts.set(w, (counts.get(w) || 0) + 1);
  for (const w of words(title)) counts.set(w, (counts.get(w) || 0) + 2);
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([w]) => w);
  return [...new Set([...extra, ...top])].slice(0, MAX_TAGS);
}

/**
 * Cut a file (or page) into pieces and tag them.
 * @returns {{ kind: 'how-to'|'notes', tags: string[], chunks: Array<{text: string, tags: string[]}> }}
 */
export function chunkAndTag(text, { title = '' } = {}) {
  const split = splitSteps(text);
  const kind = split ? 'how-to' : 'notes';
  const sourceTags = tagText(text, { title, extra: split ? ['how-to'] : [] });
  const pieces = split
    ? split.steps.map((step, i) => (i === 0 && split.intro ? `${split.intro}\n\n${step}` : step))
    : chunkText(text);
  const shared = sourceTags.filter((t) => t !== 'how-to').slice(0, 2);
  // A step's first real word (its action: brush, rinse) counts extra.
  const chunks = pieces.map((piece) => {
    const line = split ? piece.split('\n').find((l) => STEP_LINE.test(l)) || '' : '';
    const lead = words(line.replace(STEP_LINE, ''))[0] || '';
    return { text: piece, tags: tagText(piece, { title: lead, extra: [...(split ? ['how-to'] : []), ...shared] }) };
  });
  return { kind, tags: sourceTags, chunks };
}
