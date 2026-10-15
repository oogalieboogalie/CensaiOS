// State and actions for one YorWare Books window. The books themselves sync
// record by record through the board; the page you're on, the year and the
// filters stay local to you.
import React from 'react';
import { useUndo } from '../../creative/useUndo.js';
import { readBooks } from '../../../lib/yorware/books/booksModel.js';
import { booksYears, pickYear, reviewCount } from '../../../lib/yorware/books/booksQueries.js';

const NO_FILTER = Object.freeze({ year: 'year', categoryId: '', search: '', needsReview: false, accountId: '', from: '', to: '' });

export const PAGES = Object.freeze([
  ['dashboard', 'Dashboard'],
  ['timeline', 'Timeline'],
  ['assistant', 'Assistant'],
  ['transactions', 'Transactions'],
  ['import', 'Import'],
  ['receipts', 'Receipts'],
  ['rules', 'Rules'],
  ['report', 'Tax report'],
  ['categories', 'Categories'],
]);

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function useBooks(win, onUpdate) {
  const books = React.useMemo(() => readBooks(win), [win]);
  const history = useUndo(win, onUpdate);
  const winRef = React.useRef(win);
  winRef.current = win;
  const [page, setPage] = React.useState('dashboard');
  const [yearPick, setYear] = React.useState(null);
  const [filter, setFilter] = React.useState(NO_FILTER);
  const [notice, setNotice] = React.useState(null);
  const [focus, setFocus] = React.useState(null);
  const years = React.useMemo(() => booksYears(books), [books]);
  const year = pickYear(yearPick, years);
  const review = reviewCount(books);

  /**
   * Runs one change: `make(win, books)` returns a patch (or { patch, … }).
   * Errors become a notice instead of a crash. Returns the extra fields.
   */
  const run = React.useCallback((make) => {
    const out = make(winRef.current, readBooks(winRef.current));
    const patch = out && out.patch && typeof out.patch === 'object' ? out.patch : out;
    if (patch && Object.keys(patch).length) history.update(patch);
    return out;
  }, [history]);
  const apply = React.useCallback((make, okText) => {
    try {
      const out = run(make);
      if (okText) setNotice({ kind: 'ok', text: typeof okText === 'function' ? okText(out) : okText });
      return out;
    } catch (err) {
      setNotice({ kind: 'error', text: err?.message || String(err) });
      return null;
    }
  }, [run]);

  const go = React.useCallback((next, opts = {}) => {
    setPage(next);
    setNotice(null);
    // A link that filters starts from a clean filter, so an old "Needs review only" doesn't stick.
    if (opts.filter) setFilter({ ...NO_FILTER, ...opts.filter });
    setFocus(opts.focus || null);
  }, []);

  return { win, books, history, page, go, year, years, setYear, filter, setFilter, notice, setNotice, apply, run, review, today: todayIso(), focus, setFocus };
}
