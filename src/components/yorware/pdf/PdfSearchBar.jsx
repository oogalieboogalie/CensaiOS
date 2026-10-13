/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { PdfIcon } from '../pdfIcons.jsx';

/** The search row under the toolbar: Enter finds the next one, Escape closes. */
export function PdfSearchBar({ s }) {
  const q = s.query.trim();
  let count = '';
  if (q.length >= 2) count = s.busy ? 'Searching…' : s.hits.length ? `${s.at + 1} of ${s.hits.length}` : 'Not found';
  return (
    <div className="hb-yp-search" role="search">
      <input className="hb-yp-search-input" type="search" placeholder="Find in this PDF" aria-label="Find in this PDF" autoFocus
        value={s.query} onChange={(e) => s.setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); s.jump(e.shiftKey ? -1 : 1); }
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); s.close(); }
        }} />
      <span className="hb-yp-search-count" aria-live="polite">{count}</span>
      <button type="button" className="hb-of-btn" aria-label="Previous match" title="Previous (Shift+Enter)" disabled={s.hits.length < 2} onClick={() => s.jump(-1)}><PdfIcon.Prev /></button>
      <button type="button" className="hb-of-btn" aria-label="Next match" title="Next (Enter)" disabled={s.hits.length < 2} onClick={() => s.jump(1)}><PdfIcon.Next /></button>
      {s.current && <span className="hb-yp-search-snippet" title={s.current.snippet}>Page {s.current.pageNumber} · {s.current.snippet}</span>}
      <button type="button" className="hb-of-btn hb-yp-search-close" aria-label="Close search" title="Close (Escape)" onClick={s.close}><Icon.Close size={10} /></button>
    </div>
  );
}
