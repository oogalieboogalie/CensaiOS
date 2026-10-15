/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
// Every transaction, with filters, the review queue, category changes that
// teach the books a rule, notes, and a form to add one by hand.
import React from 'react';
import { getCategory } from '../../../lib/yorware/books/categories.js';
import { isGenericMerchant } from '../../../lib/yorware/books/normalize.js';
import { filterTransactions } from '../../../lib/yorware/books/booksQueries.js';
import { deleteTxPatch, markReviewedPatch, notesPatch, setCategoryPatch } from '../../../lib/yorware/books/booksEdits.js';
import { CategoryOptions, GoLink, PageHead, money, shortDate } from './BooksBits.jsx';
import { AddTransactionForm } from './BooksForms.jsx';

const PAGE_SIZE = 100;

function CategoryPicker({ b, t }) {
  const [remember, setRemember] = React.useState(!isGenericMerchant(t.merchantKey));
  const pick = (categoryId) => b.apply((win, books) => setCategoryPatch(win, books, t.id, categoryId, { remember: remember && Boolean(t.merchantKey) }));
  return (
    <div className="hb-yb-picker">
      <select value={t.categoryId} aria-label="Category" onChange={(e) => pick(e.target.value)}><CategoryOptions /></select>
      {t.merchantKey && (
        <label className="hb-yb-remember" title={`Also categorize other "${t.merchantKey}" transactions this way`}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Always for {t.merchantKey}
        </label>
      )}
    </div>
  );
}

function Notes({ b, t }) {
  const [text, setText] = React.useState(t.notes);
  React.useEffect(() => setText(t.notes), [t.notes]);
  return (
    <details>
      <summary>Notes</summary>
      <form className="hb-yb-inline-form" onSubmit={(e) => { e.preventDefault(); b.apply((win) => notesPatch(win, t.id, text)); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Business purpose, attendees…" aria-label="Notes" />
        <button type="submit" className="hb-yb-btn" data-kind="secondary">Save</button>
      </form>
    </details>
  );
}

function TxRow({ b, t, receiptId }) {
  return (
    <tr>
      <td className="hb-yb-muted hb-yb-nowrap">{shortDate(t.date)}</td>
      <td>
        <div className="hb-yb-desc">{t.description}</div>
        <div className="hb-yb-meta">
          {t.accountName}{t.notes && <> · {t.notes}</>}
          {receiptId && <> · <GoLink b={b} to="receipts" opts={{ focus: receiptId }}>Receipt</GoLink></>}
        </div>
        <div className="hb-yb-tx-actions">
          <Notes b={b} t={t} />
          <button type="button" className="hb-yb-danger" onClick={() => b.apply((win, books) => deleteTxPatch(t.id, books))}>Delete</button>
        </div>
      </td>
      <td>
        <CategoryPicker key={`${t.id}-${t.categoryId}`} b={b} t={t} />
        <div className="hb-yb-meta">
          {t.needsReview && <span className="hb-yb-tag" data-tone="review">Needs review</span>} {t.reason}
          {getCategory(t.categoryId).deductiblePct === 50 ? ' · 50% deductible' : ''}
        </div>
        {t.needsReview && <button type="button" className="hb-yb-link hb-yb-small-print" onClick={() => b.apply((win) => markReviewedPatch(win, t.id))}>Looks right</button>}
      </td>
      <td className="hb-yb-num" data-pos={t.amountCents > 0 ? 'true' : undefined}>{money(t.amountCents)}</td>
    </tr>
  );
}

export function TransactionsPage({ b }) {
  const { filter, setFilter, books } = b;
  const [page, setPage] = React.useState(1);
  const year = filter.year === 'all' ? undefined : b.year;
  const rows = React.useMemo(() => filterTransactions(books, {
    year, from: filter.from || undefined, to: filter.to || undefined, categoryId: filter.categoryId || undefined,
    needsReview: filter.needsReview, search: filter.search, accountId: filter.accountId || undefined,
  }), [books, year, filter]);
  const receiptFor = React.useMemo(() => new Map(books.receipts.filter((r) => r.transactionId).map((r) => [r.transactionId, r.id])), [books.receipts]);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const set = (change) => { setPage(1); setFilter((f) => ({ ...f, ...change })); };
  const filtered = filter.categoryId || filter.search || filter.needsReview || filter.accountId || filter.from;
  const total = rows.length;
  return (
    <>
      <PageHead title="Transactions" sub={`${total} transaction${total === 1 ? '' : 's'}${filter.needsReview ? ' to review' : ''}${filter.from && filter.to ? ` from ${shortDate(filter.from)} to ${shortDate(filter.to)}` : ''}. Change a category and the books remember it for that merchant.`} />
      <div className="hb-yb-filters hb-yb-card" role="search" aria-label="Filters">
        <select value={filter.year === 'all' ? 'all' : b.year} aria-label="Year" onChange={(e) => {
          if (e.target.value === 'all') set({ year: 'all' }); else { b.setYear(Number(e.target.value)); set({ year: '' }); }
        }}>
          <option value="all">All years</option>
          {[...new Set([b.year, ...b.years])].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={filter.categoryId} aria-label="Category" onChange={(e) => set({ categoryId: e.target.value })}>
          <option value="">All categories</option>
          <CategoryOptions />
        </select>
        {books.accounts.length > 1 && (
          <select value={filter.accountId} aria-label="Account" onChange={(e) => set({ accountId: e.target.value })}>
            <option value="">All accounts</option>
            {books.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        <input type="search" value={filter.search} placeholder="Search" aria-label="Search descriptions and notes" onChange={(e) => set({ search: e.target.value })} />
        <label className="hb-yb-muted hb-yb-inline">
          <input type="checkbox" checked={filter.needsReview} onChange={(e) => set({ needsReview: e.target.checked })} /> Needs review only
        </label>
        {filtered && <button type="button" className="hb-yb-link" onClick={() => set({ categoryId: '', search: '', needsReview: false, accountId: '', from: '', to: '' })}>Clear</button>}
      </div>
      <div className="hb-yb-card hb-yb-table-wrap">
        {rows.length === 0 ? (
          <p className="hb-yb-muted">Nothing here yet. <GoLink b={b} to="import">Import a CSV</GoLink> or add a transaction below.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Date</th><th>Description</th><th>Category</th><th className="hb-yb-num">Amount</th></tr>
            </thead>
            <tbody>
              {rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE).map((t) => <TxRow key={t.id} b={b} t={t} receiptId={receiptFor.get(t.id)} />)}
            </tbody>
          </table>
        )}
        {pageCount > 1 && (
          <p className="hb-yb-filters">
            {current > 1 && <button type="button" className="hb-yb-link" onClick={() => setPage(current - 1)}>Previous</button>}
            <span className="hb-yb-muted">Page {current} of {pageCount}</span>
            {current < pageCount && <button type="button" className="hb-yb-link" onClick={() => setPage(current + 1)}>Next</button>}
          </p>
        )}
      </div>
      <AddTransactionForm b={b} />
    </>
  );
}
