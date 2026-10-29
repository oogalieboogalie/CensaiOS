import React from 'react';
import { mapShownText, rawToRanges } from './docTextMap.js';

// Paints each Doc note over its words with the browser's highlight layer, so
// the words stay inside their sentence (wrapping them in boxes broke the line).
// Every open Doc shares the page's named highlights; each window keeps its own
// ranges here and the names are rebuilt from all of them.
const KINDS = ['comment', 'ask', 'assign'];
const byWindow = new Map();

const canPaint = () => typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined';

function repaint() {
  for (const name of [...KINDS, 'active']) {
    const ranges = [...byWindow.values()].flatMap((own) => own[name] || []);
    if (ranges.length) CSS.highlights.set(`hb-doc-note-${name}`, new Highlight(...ranges));
    else CSS.highlights.delete(`hb-doc-note-${name}`);
  }
}

export function useNoteHighlights(winId, bodyRef, text, annotations, activeAnnId, showing) {
  React.useLayoutEffect(() => {
    if (!canPaint()) return undefined;
    const body = bodyRef.current;
    const own = {};
    if (showing && body && annotations.length) {
      const map = mapShownText(body, text);
      for (const ann of annotations) {
        if (ann.lost) continue;
        const ranges = rawToRanges(map, ann.start, ann.end);
        const kind = KINDS.includes(ann.kind) ? ann.kind : 'comment';
        own[kind] = [...(own[kind] || []), ...ranges];
        if (ann.id === activeAnnId) own.active = ranges;
      }
    }
    byWindow.set(winId, own);
    repaint();
    return () => { byWindow.delete(winId); repaint(); };
  }, [winId, bodyRef, text, annotations, activeAnnId, showing]);
}

/** The note whose words cover place `at` in the file, the latest one first. */
export function noteAt(annotations, at) {
  if (at == null) return null;
  return [...annotations].reverse().find((ann) => !ann.lost && at >= ann.start && at < ann.end) || null;
}
