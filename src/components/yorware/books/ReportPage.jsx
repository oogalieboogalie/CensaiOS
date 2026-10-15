/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
// The tax report laid out like Schedule C, the self-employment tax
// estimate, and the Categories reference page.
import React from 'react';
import { CATEGORIES, CATEGORY_GROUPS } from '../../../lib/yorware/books/categories.js';
import { buildScheduleC } from '../../../lib/yorware/books/reports.js';
import { categoryTotals, unreviewedTotals } from '../../../lib/yorware/books/booksQueries.js';
import { GoLink, PageHead, ReviewBanner, YearPicker, money } from './BooksBits.jsx';

function Row({ line, label, cents, total }) {
  return (
    <tr data-total={total ? 'true' : undefined}>
      {line !== undefined && <td>{line}</td>}
      <td>{label}</td>
      <td className="hb-yb-num">{money(cents)}</td>
    </tr>
  );
}

export function ReportPage({ b, onExport }) {
  const { year } = b;
  const s = React.useMemo(() => buildScheduleC(categoryTotals(b.books, year), year), [b.books, year]);
  const guess = React.useMemo(() => unreviewedTotals(b.books, year), [b.books, year]);
  return (
    <>
      <PageHead title={`Tax report: ${year}`} sub="Your books laid out like Schedule C (Profit or Loss From Business). Share it with your tax preparer.">
        <YearPicker b={b} />
        <button type="button" className="hb-yb-link" onClick={onExport}>Download CSV</button>
      </PageHead>
      <ReviewBanner b={b} uncategorizedCents={s.uncategorizedCents} wording="could" />
      {guess.count > 0 && (
        <p className="hb-yb-banner" role="note">
          Not final: {guess.count} transaction{guess.count === 1 ? ' is' : 's are'} still a guess ({money(guess.inCents)} in, {money(guess.outCents)} out) and counted below as guessed. Check them before you send this to your tax preparer.
        </p>
      )}
      <div className="hb-yb-card hb-yb-table-wrap">
        <h2>Part I: Income</h2>
        <table>
          <tbody>
            <Row line="1" label="Gross receipts or sales" cents={s.grossReceiptsCents} />
            <Row line="2" label="Returns and allowances" cents={s.returnsCents} />
            <Row line="4" label="Cost of goods sold" cents={s.cogsCents} />
            <Row line="5" label="Gross profit" cents={s.grossProfitCents} />
            <Row line="6" label="Other income" cents={s.otherIncomeCents} />
            <Row line="7" label="Gross income" cents={s.grossIncomeCents} total />
          </tbody>
        </table>
      </div>
      <div className="hb-yb-card hb-yb-table-wrap">
        <h2>Part II: Expenses</h2>
        <table>
          <thead>
            <tr><th>Line</th><th>Expense</th><th className="hb-yb-num">Spent</th><th className="hb-yb-num">Deductible</th></tr>
          </thead>
          <tbody>
            {s.expenseLines.length === 0 && <tr><td colSpan={4} className="hb-yb-muted">No expenses recorded for {year}.</td></tr>}
            {s.expenseLines.flatMap((l) => [
              <tr key={l.line}>
                <td>{l.line}</td><td>{l.label}</td>
                <td className="hb-yb-num">{money(l.amountCents)}</td><td className="hb-yb-num">{money(l.deductibleCents)}</td>
              </tr>,
              ...(l.categories.length > 1 ? l.categories.map((c) => (
                <tr data-sub="true" key={`${l.line}-${c.category.id}`}>
                  <td />
                  <td><GoLink b={b} to="transactions" opts={{ filter: { year: '', categoryId: c.category.id } }}>{c.category.name}</GoLink></td>
                  <td className="hb-yb-num">{money(c.amountCents)}</td><td />
                </tr>
              )) : []),
            ])}
            <tr data-total="true"><td>28</td><td>Total expenses</td><td /><td className="hb-yb-num">{money(s.totalExpensesCents)}</td></tr>
            <tr data-total="true"><td>31</td><td>Net profit or (loss)</td><td /><td className="hb-yb-num">{money(s.netProfitCents)}</td></tr>
          </tbody>
        </table>
        <p className="hb-yb-muted hb-yb-small-print">
          Line 30 (business use of your home) is not included. If you work from home, you may be able to deduct $5 per square foot of
          dedicated office space, up to 300 sq ft, using the simplified method.
        </p>
      </div>
      <div className="hb-yb-grid-2">
        <div className="hb-yb-card">
          <h2>Self-employment tax estimate</h2>
          <table>
            <tbody>
              <Row label="Net earnings from self-employment (92.35%)" cents={s.seTax.netEarningsCents} />
              <Row label={`Social Security (12.4%, up to ${money(s.seTax.wageBaseCents)})`} cents={s.seTax.socialSecurityCents} />
              <Row label="Medicare (2.9%)" cents={s.seTax.medicareCents} />
              <Row label="Estimated SE tax" cents={s.seTax.totalCents} total />
              <Row label="Half is deductible (Schedule 1)" cents={s.seTax.deductibleHalfCents} />
            </tbody>
          </table>
          <p className="hb-yb-muted hb-yb-small-print">This is on top of income tax. It ignores W-2 wages and the 0.9% Additional Medicare Tax, so treat it as a planning number.</p>
        </div>
        <div className="hb-yb-card">
          <h2>Outside Schedule C</h2>
          {s.otherDeductions.length === 0 && s.nonPl.length === 0 && <p className="hb-yb-muted">Nothing for {year}.</p>}
          <table>
            <tbody>
              {s.otherDeductions.map((d) => <Row key={d.category.id} line={d.category.taxLine ?? ''} label={`${d.category.name} (deductible)`} cents={d.amountCents} />)}
              {s.nonPl.map((d) => <Row key={d.category.id} line="" label={`${d.category.name} (not deductible)`} cents={d.amountCents} />)}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export function CategoriesPage() {
  return (
    <>
      <PageHead title="Categories" sub="Every category maps to a line on IRS Schedule C or another form, so your totals are ready for tax time." />
      {CATEGORY_GROUPS.filter((g) => !g.kinds.includes('uncategorized')).map((group) => (
        <section className="hb-yb-card" key={group.label}>
          <h2>{group.label}</h2>
          <div className="hb-yb-cat-list">
            {CATEGORIES.filter((c) => group.kinds.includes(c.kind)).map((c) => (
              <div key={c.id}>
                <strong>{c.name} {c.taxLine && <span className="hb-yb-tag">{c.taxLine}</span>}</strong>
                <span className="hb-yb-muted">{c.description}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
