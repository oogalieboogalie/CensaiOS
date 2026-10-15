/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
// The Timeline page: money, events and the numbers you track on one axis,
// with forms to log an event or a day's numbers.
import React from 'react';
import { EVENT_KINDS, RANGE_PRESETS, autoGranularity, eventKindLabel, formatDay, resolveRange } from '../../../lib/yorware/books/timeline.js';
import { earliestDate, timelineData } from '../../../lib/yorware/books/booksQueries.js';
import { addEventPatch, deleteEventPatch, logMetricPatch, metricDefs } from '../../../lib/yorware/books/booksEdits.js';
import { PageHead } from './BooksBits.jsx';
import { Status, useFormRun } from './BooksForms.jsx';
import { TimelineChart } from './TimelineChart.jsx';

function EventForm({ b }) {
  const { state, submit } = useFormRun(b);
  return (
    <form onSubmit={submit((v) => addEventPatch(v), 'Logged.')} className="hb-yb-card hb-yb-form">
      <h2>Log an event</h2>
      <p className="hb-yb-muted" data-wide="true">A post, an email, a promo, anything that might move the numbers.</p>
      <label>Date<input type="date" name="date" defaultValue={b.today} required /></label>
      <label>Type
        <select name="kind" defaultValue="social_post">{EVENT_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</select>
      </label>
      <label data-wide="true">What happened<input name="title" placeholder="e.g. Instagram reel about the fall special" required /></label>
      <label data-wide="true">Link to the post (optional)<input name="url" type="url" placeholder="https://" /></label>
      <label data-wide="true">Notes<input name="notes" placeholder="Audience, spend, anything worth remembering" /></label>
      <div className="hb-yb-actions"><button type="submit" className="hb-yb-btn">Log event</button><Status state={state} /></div>
    </form>
  );
}

function MetricForm({ b, metrics }) {
  const { state, submit } = useFormRun(b);
  const [metric, setMetric] = React.useState(metrics[0]?.key ?? '__new');
  const onSubmit = submit((v, win, books) => logMetricPatch(books, { date: v.date, metric: metric === '__new' ? v.newMetric : metric, value: v.value }), 'Saved.');
  return (
    <form onSubmit={onSubmit} className="hb-yb-card hb-yb-form">
      <h2>Log daily numbers</h2>
      <p className="hb-yb-muted" data-wide="true">New contacts, appointments booked, leads. Logging a day again replaces it.</p>
      <label>Date<input type="date" name="date" defaultValue={b.today} required /></label>
      <label>What
        <select value={metric} onChange={(e) => setMetric(e.target.value)}>
          {metrics.map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}
          <option value="__new">Something else…</option>
        </select>
      </label>
      {metric === '__new' && <label>Name<input name="newMetric" placeholder="e.g. Quotes sent" required /></label>}
      <label>How many<input name="value" type="number" min="0" step="any" inputMode="decimal" required /></label>
      <div className="hb-yb-actions"><button type="submit" className="hb-yb-btn">Save</button><Status state={state} /></div>
    </form>
  );
}

export function TimelinePage({ b }) {
  const [rangeKey, setRangeKey] = React.useState('6m');
  const [by, setBy] = React.useState(null);
  const range = resolveRange(rangeKey, b.today, earliestDate(b.books));
  const granularity = by || autoGranularity(range.from, range.to);
  const data = React.useMemo(() => timelineData(b.books, range.from, range.to, granularity), [b.books, range.from, range.to, granularity]);
  const events = b.books.events.filter((e) => e.date >= range.from && e.date <= range.to).reverse().slice(0, 10);
  const metrics = metricDefs(b.books).filter((m) => !m.derived);
  return (
    <>
      <PageHead title="Timeline" sub="Money, events, and the numbers you track, on one timeline. Hover a column, click it to see what happened." />
      <div className="hb-yb-card">
        <div className="hb-yb-filters">
          <div className="hb-yb-segmented" role="group" aria-label="Date range">
            {RANGE_PRESETS.map((p) => (
              <button type="button" key={p.key} aria-pressed={p.key === range.key} onClick={() => { setRangeKey(p.key); setBy(null); }}>{p.label}</button>
            ))}
          </div>
          <div className="hb-yb-segmented" role="group" aria-label="Group by">
            {['day', 'week', 'month'].map((g) => <button type="button" key={g} aria-pressed={g === granularity} onClick={() => setBy(g)}>By {g}</button>)}
          </div>
          <span className="hb-yb-muted hb-yb-small-print">{formatDay(range.from, true)} to {formatDay(range.to, true)}</span>
        </div>
        <TimelineChart key={`${range.key}-${granularity}`} b={b} data={data} />
      </div>
      <div className="hb-yb-grid-2">
        <EventForm b={b} />
        <MetricForm b={b} metrics={metrics} />
      </div>
      <div className="hb-yb-card">
        <h2>Events in this range</h2>
        {events.length === 0 && <p className="hb-yb-muted">None yet.</p>}
        <ul className="hb-yb-plain">
          {events.map((e) => (
            <li key={e.id}>
              <span className="hb-yb-tag">{eventKindLabel(e.kind)}</span> <strong>{e.title}</strong>
              <div className="hb-yb-meta">{formatDay(e.date, true)}{e.url && <> · <a href={e.url} target="_blank" rel="noreferrer">link</a></>}</div>
              <button type="button" className="hb-yb-danger hb-yb-small-print" onClick={() => b.apply(() => deleteEventPatch(e.id))}>Delete</button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
