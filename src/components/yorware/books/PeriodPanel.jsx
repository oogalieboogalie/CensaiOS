/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
// The timeline as a table, and the panel that opens when you click a
// column: what came in and went out, what happened, the numbers logged and
// every transaction in that period.
import React from 'react';
import { getCategory } from '../../../lib/yorware/books/categories.js';
import { groupMetrics, periodDetail } from '../../../lib/yorware/books/booksQueries.js';
import { eventKindLabel, formatDay } from '../../../lib/yorware/books/timeline.js';
import { GoLink, money, num } from './BooksBits.jsx';

export function TimelineTable({ data, eventsByBucket, onSelect }) {
  return (
    <details className="hb-yb-table-view">
      <summary>Show as a table</summary>
      <div className="hb-yb-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Period</th>
              <th className="hb-yb-num">Income</th>
              <th className="hb-yb-num">Expenses</th>
              {data.series.map((s) => <th key={s.key} className="hb-yb-num">{s.name}</th>)}
              <th>Events</th>
            </tr>
          </thead>
          <tbody>
            {data.buckets.map((bk, i) => (
              <tr key={bk.start}>
                <td><button type="button" className="hb-yb-link" onClick={() => onSelect(i)}>{bk.label}</button></td>
                <td className="hb-yb-num">{money(bk.incomeCents)}</td>
                <td className="hb-yb-num">{money(bk.expenseCents)}</td>
                {data.series.map((s) => <td key={s.key} className="hb-yb-num">{num(s.values[i])}</td>)}
                <td>{(eventsByBucket.get(i) ?? []).map((e) => e.title).join('; ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function PeriodPanel({ b, bucket, onClose }) {
  const d = React.useMemo(() => periodDetail(b.books, bucket.start, bucket.end), [b.books, bucket.start, bucket.end]);
  const ref = React.useRef(null);
  React.useEffect(() => { ref.current?.scrollIntoView?.({ block: 'nearest' }); }, [bucket.start]);
  return (
    <section ref={ref} className="hb-yb-card hb-yb-period" aria-live="polite">
      <div className="hb-yb-head">
        <h2>{bucket.label}</h2>
        <button type="button" className="hb-yb-btn" data-kind="secondary" onClick={onClose}>Close</button>
      </div>
      <div className="hb-yb-kpis" data-count="3">
        <div className="hb-yb-kpi"><div className="hb-yb-kpi-label">Income</div><div className="hb-yb-kpi-value">{money(d.incomeCents)}</div></div>
        <div className="hb-yb-kpi"><div className="hb-yb-kpi-label">Expenses</div><div className="hb-yb-kpi-value">{money(d.expenseCents)}</div></div>
        <div className="hb-yb-kpi"><div className="hb-yb-kpi-label">Net</div><div className="hb-yb-kpi-value">{money(d.incomeCents - d.expenseCents)}</div></div>
      </div>
      <div className="hb-yb-grid-2">
        <div>
          <h3>What happened</h3>
          {d.events.length === 0 && <p className="hb-yb-muted">No events logged.</p>}
          <ul className="hb-yb-plain">
            {d.events.map((e) => (
              <li key={e.id}>
                <span className="hb-yb-tag">{eventKindLabel(e.kind)}</span> <strong>{e.title}</strong>
                <div className="hb-yb-meta">
                  {formatDay(e.date, true)}
                  {e.url && <> · <a href={e.url} target="_blank" rel="noreferrer">link</a></>}
                  {e.notes && <> · {e.notes}</>}
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Numbers logged</h3>
          {d.metrics.length === 0 && <p className="hb-yb-muted">None logged.</p>}
          <ul className="hb-yb-plain">
            {groupMetrics(d.metrics).map((g) => (
              <li key={g.key}>
                <strong>{num(g.total)}</strong> {g.name}
                {g.days.length > 1 && <div className="hb-yb-meta">{g.days.map((x) => `${formatDay(x.date)}: ${num(x.value)}`).join(' · ')}</div>}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <h3>Transactions ({d.transactionCount})</h3>
      {d.transactions.length === 0 ? <p className="hb-yb-muted">No transactions.</p> : (
        <div className="hb-yb-table-wrap">
          <table>
            <tbody>
              {d.transactions.map((t) => (
                <tr key={t.id}>
                  <td className="hb-yb-muted hb-yb-nowrap">{formatDay(t.date)}</td>
                  <td>
                    <div className="hb-yb-desc">{t.description}</div>
                    <div className="hb-yb-meta">
                      {getCategory(t.categoryId).name}{t.notes ? ` · ${t.notes}` : ''}
                      {t.receiptId && <> · <GoLink b={b} to="receipts" opts={{ focus: t.receiptId }}>receipt</GoLink></>}
                    </div>
                  </td>
                  <td className="hb-yb-num" data-pos={t.amountCents > 0 ? 'true' : undefined}>{money(t.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {d.transactionCount > d.transactions.length && (
        <p><GoLink b={b} to="transactions" opts={{ filter: { from: d.from, to: d.to, year: 'all' } }}>See all {d.transactionCount} transactions</GoLink></p>
      )}
    </section>
  );
}
