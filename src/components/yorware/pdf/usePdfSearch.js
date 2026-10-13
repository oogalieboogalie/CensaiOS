// Search the words of every page, in the board's page order. Text is read
// with pdf.js once per page and turn; what you search for stays yours.
import React from 'react';
import { pageText } from '../../../lib/yorware/pdfRender.js';
import { shownRotation } from '../../../lib/yorware/pdfModel.js';
import { findInPieces, joinPieces, snippetAt } from '../../../lib/yorware/pdfText.js';

export function usePdfSearch(doc, goTo) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [hits, setHits] = React.useState([]);
  const [at, setAt] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const pagesKey = doc.order.map((id) => `${id}:${shownRotation(doc.pages[id])}`).join(',');

  React.useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) { setHits([]); setBusy(false); return undefined; }
    let live = true;
    setBusy(true);
    const timer = setTimeout(async () => {
      const out = [];
      for (const [i, pageId] of doc.order.entries()) {
        const pg = doc.pages[pageId];
        let pieces = [];
        try { pieces = await pageText(pg.file, doc.files[pg.file].data, pg.index, shownRotation(pg)); } catch { pieces = []; }
        if (!live) return;
        const { text } = joinPieces(pieces);
        findInPieces(pieces, q).forEach((h) => out.push({ pageId, pageNumber: i + 1, boxes: h.boxes, snippet: snippetAt(text, h.start, q.length) }));
      }
      setHits(out);
      setAt(0);
      setBusy(false);
      if (out[0]) goTo(out[0].pageId);
    }, 220);
    return () => { live = false; clearTimeout(timer); };
  }, [open, query, pagesKey]); // pagesKey stands for the pages

  const jump = (delta) => {
    if (!hits.length) return;
    const next = (at + delta + hits.length) % hits.length;
    setAt(next);
    goTo(hits[next].pageId);
  };
  const close = () => { setOpen(false); setHits([]); };
  return { open, setOpen, query, setQuery, hits, at, busy, jump, close, current: hits[at] || null };
}

/** The finds on one page, each marked whether it is the current one. */
export function findsOnPage(s, pageId) {
  if (!s?.open) return [];
  return s.hits.flatMap((h, i) => (h.pageId === pageId ? h.boxes.map((b) => ({ ...b, current: i === s.at })) : []));
}
