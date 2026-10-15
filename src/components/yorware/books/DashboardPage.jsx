/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
// The Dashboard: the year at a glance, the month-by-month timeline, where
// the money went and the latest transactions.
import React from 'react';
import { getCategory } from '../../../lib/yorware/books/categories.js';
import { buildScheduleC } from '../../../lib/yorware/books/reports.js';
import { categoryTotals, filterTransactions, timelineData } from '../../../lib/yorware/books/booksQueries.js';
import { demoBooksPatch, removeSamplePatch } from '../../../lib/yorware/books/booksDemo.js';
import { GoLink, Kpi, PageHead, ReviewBanner, YearPicker, money, moneyWhole, shortDate } from './BooksBits.jsx';
import { TimelineChart } from './TimelineChart.jsx';

function Welcome({ b }) {
  const loadDemo = () => b.apply((win) => demoBooksPatch(win, b.today), 'Loaded six months of sample books. Remove them any time from the Dashboard.');
  return (
    <>
      <PageHead title="Welcome to Open Books" sub="Track income and expenses, sorted into the categories your tax return uses." />
      <div className="hb-yb-card">
        <h2>Get started</h2>
        <ol>
          <li><GoLink b={b} to="import">Import a CSV</GoLink> from your business bank account or credit card. Every transaction gets a tax category automatically.</li>
          <li><GoLink b={b} to="transactions" opts={{ filter: { needsReview: true } }}>Review</GoLink> anything the categorizer was unsure about. Your corrections become rules, so it learns your business.</li>
          <li>Open the <GoLink b={b} to="report">tax report</GoLink> to see your numbers laid out like Schedule C.</li>
        </ol>
        <p className="hb-yb-muted">Prefer to type them in? <GoLink b={b} to="transactions">Add transactions by hand.</GoLink></p>
        <p className="hb-yb-muted">Just looking around? <button type="button" className="hb-yb-link" onClick={loadDemo}>Load six months of sample books</button> from a small design studio.</p>
      </div>
    </>
  );
}

export function DashboardPage({ b }) {
  const { books, year } = b;
  const summary = React.useMemo(() => buildScheduleC(categoryTotals(books, year), year), [books, year]);
  const timeline = React.useMemo(() => timelineData(books, `${year}-01-01`, `${year}-12-31`, 'month'), [books, year]);
  if (!b.years.length) return <Welcome b={b} />;
  const recent = filterTransactions(books, { year }).slice(0, 8);
  const topLines = [...summary.expenseLines].sort((x, y) => y.deductibleCents - x.deductibleCents).slice(0, 8);
  const topMax = Math.max(1, ...topLines.map((l) => l.amountCents));
  return (
    <>
      <PageHead title="Dashboard" sub={String(year) === b.today.slice(0, 4) ? `Year to date, ${year}` : `All of ${year}`}><YearPicker b={b} /></PageHead>
      {books.hasSample && (
        <p className="hb-yb-banner" role="note">
          These books include sample data from a made-up design studio.{' '}
          <button type="button" className="hb-yb-link" onClick={() => b.apply((win) => removeSamplePatch(win), 'Removed the sample books. Everything you added is still here.')}>Remove the sample books</button>
        </p>
      )}
      <ReviewBanner b={b} />
      <section className="hb-yb-kpis" aria-label="Summary">
        <Kpi label="Income" value={moneyWhole(summary.grossIncomeCents)} sub="Gross income (Sch. C line 7)" />
        <Kpi label="Deductible expenses" value={moneyWhole(summary.totalExpensesCents)} sub="Sch. C line 28" />
        <Kpi label="Net profit" value={moneyWhole(summary.netProfitCents)} sub="Sch. C line 31" />
        <Kpi label="Est. self-employment tax" value={moneyWhole(summary.seTax.totalCents)} sub="Plan to set this aside" />
      </section>
      <div className="hb-yb-card">
        <div className="hb-yb-head hb-yb-head-tight">
          <h2>Income and expenses by month</h2>
          <GoLink b={b} to="timeline">Open the timeline for days, weeks, and events</GoLink>
        </div>
        <TimelineChart key={year} b={b} data={timeline} />
      </div>
      <div className="hb-yb-grid-2">
        <div className="hb-yb-card">
          <h2>Where the money went</h2>
          {topLines.length === 0 && <p className="hb-yb-muted">No expenses yet.</p>}
          {topLines.map((l) => (
            <div className="hb-yb-bar-row" key={l.line}>
              <span>{l.label}</span>
              <span className="hb-yb-bar-track"><span className="hb-yb-bar-fill" style={{ width: `${(Math.max(0, l.amountCents) / topMax) * 100}%` }} /></span>
              <span className="hb-yb-num">{money(l.amountCents)}</span>
            </div>
          ))}
          <p><GoLink b={b} to="report">Full tax report</GoLink></p>
        </div>
        <div className="hb-yb-card">
          <h2>Recent transactions</h2>
          <table>
            <tbody>
              {recent.map((t) => (
                <tr key={t.id}>
                  <td>
                    <div className="hb-yb-desc">{t.description}</div>
                    <div className="hb-yb-meta">{shortDate(t.date)} · {getCategory(t.categoryId).name}</div>
                  </td>
                  <td className="hb-yb-num" data-pos={t.amountCents > 0 ? 'true' : undefined}>{money(t.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p><GoLink b={b} to="transactions">All transactions</GoLink></p>
        </div>
      </div>
    </>
  );
}
