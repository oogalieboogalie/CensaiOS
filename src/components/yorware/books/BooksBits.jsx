/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
// Small shared pieces of YorWare Books: summary tiles, the category list,
// the year picker, the review banner and form messages.
import React from 'react';
import { CATEGORIES, CATEGORY_GROUPS } from '../../../lib/yorware/books/categories.js';

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const usdWhole = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
// "+ 0" turns -0 into 0 so nothing shows as "-$0.00".
export const money = (cents) => usd.format(cents / 100 + 0);
export const moneyWhole = (cents) => usdWhole.format(Math.sign(cents) * Math.round(Math.abs(cents) / 100) + 0);
export const num = (n) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

export function shortDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** "12.34", "-12.34", "$1,200" or "12,50" into integer cents, or null. */
export function dollarsToCents(input) {
  let s = String(input || '').replace(/[$\s]/g, '');
  const negative = s.startsWith('-');
  if (negative) s = s.slice(1);
  s = /^\d+,\d{1,2}$/.test(s) || /^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const cents = Math.round(parseFloat(s) * 100);
  return negative ? -cents : cents;
}

export function Kpi({ label, value, sub }) {
  return (
    <div className="hb-yb-kpi">
      <div className="hb-yb-kpi-label">{label}</div>
      <div className="hb-yb-kpi-value">{value}</div>
      {sub && <div className="hb-yb-kpi-sub">{sub}</div>}
    </div>
  );
}

export function CategoryOptions({ includeAuto = false }) {
  return (
    <>
      {includeAuto && <option value="">Auto-categorize</option>}
      {CATEGORY_GROUPS.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {CATEGORIES.filter((c) => group.kinds.includes(c.kind) && !(includeAuto && c.id === 'uncategorized')).map((c) => (
            <option key={c.id} value={c.id}>{c.name}{c.taxLine ? ` (${c.taxLine})` : ''}</option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

export function YearPicker({ b }) {
  const years = b.years.length ? b.years : [b.year];
  return (
    <label className="hb-yb-inline">
      <span className="hb-yb-muted">Tax year</span>
      <select value={b.year} onChange={(e) => b.setYear(Number(e.target.value))} aria-label="Tax year">
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
    </label>
  );
}

export function ReviewBanner({ b, uncategorizedCents = 0, wording = 'need' }) {
  if (!b.review && !uncategorizedCents) return null;
  const n = b.review;
  return (
    <div className="hb-yb-banner">
      {uncategorizedCents !== 0 && <>{money(Math.abs(uncategorizedCents))} is uncategorized and not counted below. </>}
      {n > 0 && (wording === 'need'
        ? <>{n} transaction{n === 1 ? '' : 's'} need{n === 1 ? 's' : ''} a category check. </>
        : <>{n} transaction{n === 1 ? '' : 's'} could use a review. </>)}
      <button type="button" className="hb-yb-link" onClick={() => b.go('transactions', { filter: { needsReview: true, year: 'all' } })}>Review now</button>
    </div>
  );
}

export function PageHead({ title, sub, children }) {
  return (
    <div className="hb-yb-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="hb-yb-muted">{sub}</p>}
      </div>
      {children && <div className="hb-yb-head-tools">{children}</div>}
    </div>
  );
}

/** A link-styled button that moves to another page of the books. */
export function GoLink({ b, to, opts, children }) {
  return <button type="button" className="hb-yb-link" onClick={() => b.go(to, opts)}>{children}</button>;
}

/** Reads a form into a plain object. */
export const formValues = (e) => Object.fromEntries(new FormData(e.currentTarget).entries());
