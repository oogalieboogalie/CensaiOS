/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
// Import (bank and card CSV files, accounts) and Rules.
import React from 'react';
import { getCategory } from '../../../lib/yorware/books/categories.js';
import { rowsFromCsv } from '../../../lib/yorware/books/csv.js';
import { importRowsPatch, readBooks } from '../../../lib/yorware/books/booksModel.js';
import { deleteRulePatch, recategorizePatch } from '../../../lib/yorware/books/booksEdits.js';
import { matchWaitingPatch } from '../../../lib/yorware/books/booksReceipts.js';
import { GoLink, PageHead } from './BooksBits.jsx';
import { AccountForm, RuleForm } from './BooksForms.jsx';

function ImportForm({ b }) {
  const [state, setState] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const onSubmit = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const file = form.elements.file.files?.[0];
    if (!file) { setState({ error: 'Choose a CSV file.' }); return; }
    setBusy(true);
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('That file is over 10 MB. Export a shorter date range from your bank.');
      const parsed = rowsFromCsv(await file.text(), { flipSigns: form.elements.flipSigns.checked });
      if (!parsed.rows.length) throw new Error(parsed.errors[0] || 'No transactions found in that file.');
      const accountId = form.elements.accountId.value;
      const out = b.run((win, books) => {
        const imported = importRowsPatch(books, accountId, parsed.rows);
        // Receipts that were waiting for these charges match now.
        const after = readBooks({ ...win, ...imported.patch });
        const waiting = matchWaitingPatch(after);
        return { ...imported, matched: waiting.matched, patch: { ...imported.patch, ...waiting.patch } };
      });
      setState({ ...out, skipped: parsed.errors.slice(0, 8) });
      form.reset();
    } catch (err) {
      setState({ error: err?.message || String(err) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={onSubmit} className="hb-yb-card hb-yb-form">
      <label data-wide="true">CSV file from your bank or card<input type="file" name="file" accept=".csv,text/csv" required /></label>
      <label>Account
        <select name="accountId">{b.books.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
      </label>
      <label className="hb-yb-check" data-wide="true">
        <input type="checkbox" name="flipSigns" /> Purchases show as positive numbers in this file (common for credit card exports)
      </label>
      <div className="hb-yb-actions"><button type="submit" className="hb-yb-btn" disabled={busy}>{busy ? 'Importing…' : 'Import'}</button></div>
      {state.error && <p className="hb-yb-msg" data-tone="error" data-wide="true" role="alert">{state.error}</p>}
      {state.imported !== undefined && (
        <div className="hb-yb-msg" data-tone="ok" data-wide="true" role="status">
          <p>
            Imported {state.imported} transaction{state.imported === 1 ? '' : 's'}
            {state.duplicates ? `, skipped ${state.duplicates} already imported` : ''}
            {state.full ? `, and ${state.full} did not fit (these books are full)` : ''}.{' '}
            {state.matched ? `${state.matched} waiting receipt${state.matched === 1 ? '' : 's'} matched. ` : ''}
            {state.needsReview
              ? <GoLink b={b} to="transactions" opts={{ filter: { needsReview: true, year: 'all' } }}>{state.needsReview} need a quick review.</GoLink>
              : <GoLink b={b} to="transactions">View transactions.</GoLink>}
            {state.needsReview ? <> Or let an agent <GoLink b={b} to="assistant">sort the unsure ones with AI</GoLink>.</> : null}
          </p>
          {state.skipped?.length > 0 && <ul className="hb-yb-muted">{state.skipped.map((s) => <li key={s}>{s}</li>)}</ul>}
        </div>
      )}
    </form>
  );
}

export function ImportPage({ b }) {
  return (
    <>
      <PageHead title="Import transactions" sub="Download a CSV from your bank or card's website and bring it in here. Each transaction is categorized automatically." />
      <ImportForm b={b} />
      <div className="hb-yb-grid-2">
        <div className="hb-yb-card">
          <h2>Accounts</h2>
          <ul>{b.books.accounts.map((a) => <li key={a.id}>{a.name} <span className="hb-yb-muted">({a.type.replace('_', ' ')})</span></li>)}</ul>
          <AccountForm b={b} />
        </div>
        <div className="hb-yb-card">
          <h2>Tips</h2>
          <ul>
            <li>Most banks offer CSV under &quot;Download&quot; or &quot;Export&quot; on the activity page.</li>
            <li>The file needs a header row with a date, a description, and either an amount or separate debit and credit columns.</li>
            <li>Importing an overlapping date range is safe: transactions already imported are skipped, even when a teammate imported them.</li>
            <li>Keep business and personal spending in separate accounts if you can. It makes your books much cleaner.</li>
          </ul>
        </div>
      </div>
    </>
  );
}

const MATCH = { contains: 'contains', starts_with: 'starts with', exact: 'is exactly' };
const DIRECTION = { any: '', in: ' (money in)', out: ' (money out)' };

export function RulesPage({ b }) {
  const rerun = () => b.apply((win, books) => recategorizePatch(win, books), (patch) => {
    const n = Object.keys(patch || {}).length;
    return n ? `Re-sorted ${n} transaction${n === 1 ? '' : 's'}.` : 'Everything already matches your rules.';
  });
  return (
    <>
      <PageHead title="Rules" sub={'Rules run before the built-in categorizer. They are made when you change a category with "Always for…" checked, or you can add one here.'}>
        <button type="button" className="hb-yb-btn" data-kind="secondary" onClick={rerun}>Re-run categorization</button>
      </PageHead>
      <div className="hb-yb-card hb-yb-table-wrap">
        {b.books.rules.length === 0 ? <p className="hb-yb-muted">No rules yet.</p> : (
          <table>
            <thead><tr><th>When description</th><th>Category</th><th /></tr></thead>
            <tbody>
              {b.books.rules.map((r) => (
                <tr key={r.id}>
                  <td>{MATCH[r.matchType]} <strong>{r.pattern}</strong><span className="hb-yb-muted">{DIRECTION[r.direction]}</span></td>
                  <td>{getCategory(r.categoryId).name}</td>
                  <td className="hb-yb-num">
                    <button type="button" className="hb-yb-danger" onClick={() => b.apply((win, books) => deleteRulePatch(win, books, r.id))}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <RuleForm b={b} />
    </>
  );
}
