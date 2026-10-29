// A Doc comment is saved as letter places (start, end) in the text, plus the
// words it covers. Text typed above it shifts those places, so each time the
// text changes the comment is found again by its words: the copy whose
// neighbouring words match best, then the one nearest where it was. Only the
// screen uses the found place; nothing is written back.

const CONTEXT = 24;

/** The words a new comment covers, with a few letters either side to tell repeats apart. */
export function noteWords(text, start, end) {
  return {
    raw: text.slice(start, end),
    before: text.slice(Math.max(0, start - CONTEXT), start),
    after: text.slice(end, end + CONTEXT),
  };
}

function sharedEnd(a, b) {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}

function sharedStart(a, b) {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

function fits(text, ann, at, words) {
  return sharedEnd(ann.before || '', text.slice(Math.max(0, at - CONTEXT), at))
    + sharedStart(ann.after || '', text.slice(at + words.length, at + words.length + CONTEXT));
}

/**
 * Where a comment's words sit in `text` now. A comment whose words are gone
 * comes back with lost: true; an old comment saved without its exact words
 * keeps its saved places.
 */
export function anchorNote(text, ann) {
  const words = ann.raw ?? ann.quote ?? '';
  if (!words) return ann;
  const here = text.slice(ann.start, ann.end) === words;
  const hasContext = Boolean(ann.before || ann.after);
  if (here && (!hasContext || fits(text, ann, ann.start, words) === (ann.before || '').length + (ann.after || '').length)) return ann;
  let best = null;
  for (let at = text.indexOf(words); at >= 0; at = text.indexOf(words, at + 1)) {
    const score = hasContext ? fits(text, ann, at, words) : 0;
    const far = Math.abs(at - ann.start);
    if (!best || score > best.score || (score === best.score && far < best.far)) best = { at, score, far };
  }
  if (best) return best.at === ann.start ? ann : { ...ann, start: best.at, end: best.at + words.length };
  if (ann.raw == null) return ann;
  return { ...ann, lost: true };
}

export const anchorNotes = (text, annotations) => annotations.map((ann) => anchorNote(text, ann));
