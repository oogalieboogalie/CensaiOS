/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
// Receipts: photos and PDFs matched to the charges they belong to.
import React from 'react';
import {
  addReceiptPatch, autoMatchFor, deleteReceiptPatch, ignoreReceiptPatch, linkReceiptPatch, receiptCandidates,
  receiptToTransactionPatch, unlinkReceiptPatch, updateReceiptPatch,
} from '../../../lib/yorware/books/booksReceipts.js';
import { readBooks } from '../../../lib/yorware/books/booksModel.js';
import { PageHead, dollarsToCents, money, shortDate } from './BooksBits.jsx';
import { Status } from './BooksForms.jsx';
import { RECEIPT_ACCEPT, openReceiptFile, receiptFile, receiptFileType, receiptThumbSrc } from './receiptFiles.js';

const TABS = [['unmatched', 'To match'], ['matched', 'Matched'], ['ignored', 'Ignored'], ['all', 'All']];
const SOURCE = { forward: 'Emailed', upload: 'Uploaded' };

function UploadForm({ b }) {
  const [state, setState] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const onSubmit = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    try {
      const file = await receiptFile(form.elements.file.files?.[0]);
      const amount = form.elements.amount.value.trim();
      const cents = amount ? dollarsToCents(amount) : null;
      if (amount && cents === null) throw new Error('Enter the amount like 42.17.');
      const out = b.run((win, books) => {
        const added = addReceiptPatch(books, { vendor: form.elements.vendor.value, amountCents: cents, date: form.elements.date.value }, file);
        const after = readBooks({ ...win, ...added.patch });
        const r = after.receipts.find((x) => x.id === added.id);
        const txId = r && autoMatchFor(after, r);
        return { matched: Boolean(txId), patch: txId ? { ...added.patch, ...linkReceiptPatch(r, txId, 'auto') } : added.patch };
      });
      setState({ ok: out.matched ? 'Saved and matched to its charge.' : 'Saved. It will match when its charge is imported.' });
      form.reset();
    } catch (err) {
      setState({ error: err?.message || String(err) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={onSubmit} className="hb-yb-card hb-yb-form">
      <h2>Add a receipt</h2>
      <label data-wide="true">Photo or PDF<input type="file" name="file" accept={RECEIPT_ACCEPT} capture="environment" /></label>
      <label>Paid to<input name="vendor" placeholder="e.g. Home Depot" /></label>
      <label>Amount<input name="amount" inputMode="decimal" placeholder="0.00" /></label>
      <label>Date<input type="date" name="date" defaultValue={b.today} /></label>
      <div className="hb-yb-actions"><button type="submit" className="hb-yb-btn" disabled={busy}>{busy ? 'Saving…' : 'Save receipt'}</button><Status state={state} /></div>
    </form>
  );
}

function Fix({ b, r }) {
  const onSubmit = (e) => {
    e.preventDefault();
    const f = e.currentTarget.elements;
    const amount = f.amount.value.trim();
    const cents = amount ? dollarsToCents(amount) : null;
    b.apply(() => {
      if (amount && cents === null) throw new Error('Enter the amount like 42.17.');
      return updateReceiptPatch(r, { vendor: f.vendor.value, amountCents: cents, date: f.date.value });
    });
  };
  return (
    <details>
      <summary>Fix the details</summary>
      <form onSubmit={onSubmit} className="hb-yb-inline-form">
        <input name="vendor" defaultValue={r.vendor} placeholder="Paid to" aria-label="Paid to" />
        <input name="amount" defaultValue={r.amountCents !== null ? (r.amountCents / 100).toFixed(2) : ''} placeholder="Amount" aria-label="Amount" inputMode="decimal" />
        <input type="date" name="date" defaultValue={r.date ?? ''} aria-label="Date" />
        <button type="submit" className="hb-yb-btn" data-kind="secondary">Save</button>
      </form>
    </details>
  );
}

function Receipt({ b, r, linked, focused }) {
  const cands = r.status === 'unmatched' ? receiptCandidates(b.books, r) : [];
  const [account, setAccount] = React.useState(b.books.accounts[0]?.id);
  return (
    <article className="hb-yb-receipt" data-focus={focused ? 'true' : undefined}>
      <div>
        <strong>{r.vendor || 'Receipt'}</strong>{' '}
        {r.status === 'matched' && <span className="hb-yb-tag" data-tone="good">Matched{r.matchKind === 'auto' ? ' automatically' : ''}</span>}
        {r.status === 'ignored' && <span className="hb-yb-tag">Ignored</span>}
        <div className="hb-yb-meta">{r.date ? shortDate(r.date) : 'No date'} · {SOURCE[r.source] || 'Uploaded'}{r.orderRef && <> · Order {r.orderRef}</>}</div>
      </div>
      <div className="hb-yb-receipt-amount">{r.amountCents === null ? <span className="hb-yb-muted">No amount</span> : money(r.amountCents)}</div>
      <div className="hb-yb-receipt-body">
        {r.file && (
          <div className="hb-yb-tx-actions">
            {receiptThumbSrc(r.file) && <img className="hb-yb-receipt-thumb" src={receiptThumbSrc(r.file)} alt={`Receipt from ${r.vendor || 'a store'}`} />}
            <button type="button" className="hb-yb-link" onClick={() => openReceiptFile(r.file)}>{receiptFileType(r.file) === 'application/pdf' ? String(r.file.name || 'PDF') : 'Open photo'}</button>
          </div>
        )}
        {linked && (
          <div className="hb-yb-candidate">
            <span>{linked.description} <span className="hb-yb-muted">· {shortDate(linked.date)}</span></span>
            <span className="hb-yb-inline-form"><strong className="hb-yb-num">{money(linked.amountCents)}</strong>
              <button type="button" className="hb-yb-link" onClick={() => b.apply(() => unlinkReceiptPatch(r))}>Unlink</button></span>
          </div>
        )}
        {r.status === 'unmatched' && (
          <>
            {cands.length > 0 ? (
              <>
                <div className="hb-yb-meta">Is it one of these?</div>
                {cands.map((c) => (
                  <div key={c.tx.id} className="hb-yb-candidate">
                    <span>{c.tx.description} <span className="hb-yb-muted">· {shortDate(c.tx.date)} · {c.reason}</span></span>
                    <span className="hb-yb-inline-form"><strong className="hb-yb-num">{money(c.tx.amountCents)}</strong>
                      <button type="button" className="hb-yb-btn" data-kind="secondary" onClick={() => b.apply(() => linkReceiptPatch(r, c.tx.id))}>This one</button></span>
                  </div>
                ))}
              </>
            ) : <div className="hb-yb-meta">No matching charge yet. It will match automatically when the transaction is imported.</div>}
            <div className="hb-yb-tx-actions">
              <Fix b={b} r={r} />
              {r.amountCents !== null && r.date && (
                <details>
                  <summary>Record as a new expense</summary>
                  <span className="hb-yb-inline-form">
                    <select value={account} onChange={(e) => setAccount(e.target.value)} aria-label="Paid from">
                      {b.books.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                    <button type="button" className="hb-yb-btn" data-kind="secondary" onClick={() => b.apply((win, books) => receiptToTransactionPatch(books, r, account))}>Add {money(-r.amountCents)}</button>
                  </span>
                  <p className="hb-yb-meta">For cash or a card you don&apos;t import, so it isn&apos;t counted twice.</p>
                </details>
              )}
            </div>
          </>
        )}
        <div className="hb-yb-tx-actions">
          {r.status !== 'matched' && <button type="button" className="hb-yb-link" onClick={() => b.apply(() => ignoreReceiptPatch(r, r.status !== 'ignored'))}>{r.status === 'ignored' ? 'Restore' : 'Not a business expense'}</button>}
          <button type="button" className="hb-yb-danger" onClick={() => b.apply(() => deleteReceiptPatch(r))}>Delete</button>
        </div>
      </div>
    </article>
  );
}

export function ReceiptsPage({ b }) {
  const [tab, setTab] = React.useState(b.focus ? 'all' : 'unmatched');
  const { receipts, transactions } = b.books;
  const counts = { unmatched: 0, matched: 0, ignored: 0 };
  for (const r of receipts) counts[r.status] = (counts[r.status] || 0) + 1;
  const byId = new Map(transactions.map((t) => [t.id, t]));
  let rows = tab === 'all' ? receipts : receipts.filter((r) => r.status === tab);
  const focus = receipts.find((r) => r.id === b.focus);
  if (focus) rows = [focus, ...rows.filter((r) => r.id !== focus.id)];
  return (
    <>
      <PageHead title="Receipts" sub="Photos and PDFs of receipts, matched to the transactions they belong to." />
      <div className="hb-yb-grid-2">
        <div className="hb-yb-kpis" data-count="2">
          <div className="hb-yb-kpi"><div className="hb-yb-kpi-label">To match</div><div className="hb-yb-kpi-value">{counts.unmatched}</div><div className="hb-yb-kpi-sub">waiting for a transaction</div></div>
          <div className="hb-yb-kpi"><div className="hb-yb-kpi-label">Matched</div><div className="hb-yb-kpi-value">{counts.matched}</div><div className="hb-yb-kpi-sub">attached to transactions</div></div>
        </div>
        <UploadForm b={b} />
      </div>
      <div className="hb-yb-card">
        <div className="hb-yb-segmented" role="group" aria-label="Show">
          {TABS.map(([k, label]) => <button type="button" key={k} aria-pressed={k === tab} onClick={() => setTab(k)}>{label} ({k === 'all' ? receipts.length : counts[k] || 0})</button>)}
        </div>
        {rows.length === 0 && <p className="hb-yb-muted">{tab === 'unmatched' ? 'Nothing waiting. Receipts saved before their transaction is imported wait here, then match on their own.' : 'No receipts here yet.'}</p>}
        {rows.map((r) => <Receipt key={r.id} b={b} r={r} linked={r.transactionId ? byId.get(r.transactionId) : null} focused={r.id === b.focus} />)}
      </div>
    </>
  );
}
