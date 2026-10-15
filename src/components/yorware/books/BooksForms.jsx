/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
// The forms of YorWare Books. Each shows its own "saved" or error line, like
// Open Books did, so the answer is next to the button you pressed.
import React from 'react';
import { ACCOUNT_TYPES, addAccountPatch, addTransactionPatch } from '../../../lib/yorware/books/booksModel.js';
import { createRulePatch } from '../../../lib/yorware/books/booksEdits.js';
import { CategoryOptions, dollarsToCents, formValues } from './BooksBits.jsx';

/** Runs a change from a form and keeps its own message. */
export function useFormRun(b) {
  const [state, setState] = React.useState({});
  const submit = (make, ok) => (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const values = formValues(e);
    try {
      const out = b.run((win, books) => make(values, win, books));
      setState({ ok: typeof ok === 'function' ? ok(out, values) : ok });
      form.reset();
    } catch (err) {
      setState({ error: err?.message || String(err) });
    }
  };
  return { state, submit, setState };
}

export function Status({ state }) {
  if (state.error) return <p className="hb-yb-msg" data-tone="error" role="alert">{state.error}</p>;
  if (state.ok) return <p className="hb-yb-msg" data-tone="ok" role="status">{state.ok}</p>;
  return null;
}

export function AddTransactionForm({ b }) {
  const { state, submit } = useFormRun(b);
  const onSubmit = submit((v, win, books) => {
    const cents = dollarsToCents(v.amount);
    if (cents === null || cents === 0) throw new Error('Enter an amount like 12.50.');
    return addTransactionPatch(books, {
      date: v.date, description: v.description, amountCents: v.direction === 'in' ? Math.abs(cents) : -Math.abs(cents),
      accountId: v.accountId, categoryId: v.categoryId, notes: v.notes,
    });
  }, 'Added.');
  return (
    <form onSubmit={onSubmit} className="hb-yb-card hb-yb-form">
      <h2>Add a transaction</h2>
      <label>Date<input type="date" name="date" defaultValue={b.today} required /></label>
      <label data-wide="true">Description<input name="description" placeholder="e.g. Staples, printer paper" required /></label>
      <label>Type
        <select name="direction" defaultValue="out"><option value="out">Money out</option><option value="in">Money in</option></select>
      </label>
      <label>Amount<input name="amount" inputMode="decimal" placeholder="0.00" required /></label>
      <label>Account
        <select name="accountId">{b.books.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
      </label>
      <label data-wide="true">Category<select name="categoryId" defaultValue=""><CategoryOptions includeAuto /></select></label>
      <label data-wide="true">Notes<input name="notes" placeholder="Who, what, and why (helpful for meals and travel)" /></label>
      <div className="hb-yb-actions"><button type="submit" className="hb-yb-btn">Add transaction</button><Status state={state} /></div>
    </form>
  );
}

export function AccountForm({ b }) {
  const { state, submit } = useFormRun(b);
  return (
    <form onSubmit={submit((v) => addAccountPatch(v.name, v.type), (out, v) => `Added ${v.name.trim()}.`)} className="hb-yb-inline-form">
      <input name="name" placeholder="Account name, e.g. Amex Business" aria-label="Account name" required />
      <select name="type" aria-label="Account type" defaultValue="credit_card">
        {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t === 'credit_card' ? 'Credit card' : t[0].toUpperCase() + t.slice(1)}</option>)}
      </select>
      <button type="submit" className="hb-yb-btn">Add account</button>
      <Status state={state} />
    </form>
  );
}

export function RuleForm({ b }) {
  const { state, submit } = useFormRun(b);
  const onSubmit = submit((v, win, books) => createRulePatch(win, books, v), 'Rule saved. Matching transactions were re-sorted.');
  return (
    <form onSubmit={onSubmit} className="hb-yb-card hb-yb-form">
      <h2>New rule</h2>
      <label data-wide="true">When the description
        <span className="hb-yb-row">
          <select name="matchType" aria-label="Match type" defaultValue="contains">
            <option value="contains">contains</option><option value="starts_with">starts with</option><option value="exact">is exactly</option>
          </select>
          <input name="pattern" placeholder="e.g. JOE'S PIZZA" aria-label="Text to match" required />
        </span>
      </label>
      <label>For
        <select name="direction" defaultValue="any">
          <option value="any">Money in or out</option><option value="out">Money out</option><option value="in">Money in</option>
        </select>
      </label>
      <label data-wide="true">Categorize as<select name="categoryId" required><CategoryOptions /></select></label>
      <div className="hb-yb-actions"><button type="submit" className="hb-yb-btn">Save rule</button><Status state={state} /></div>
    </form>
  );
}
