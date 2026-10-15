import React from 'react';
import { clockWords, dayBucket, fromNow, whenWords } from '../../lib/schedule/plainWords.js';

const dayWord = (when, now) => whenWords(when, now).replace(/ at .*$/, '');
// A run on the same day as the row above only needs its time.
const sameDay = (a, b, now) => Boolean(a && b) && dayWord(new Date(a), now) === dayWord(new Date(b), now);

/** One row: the time on the left, what runs in the middle, actions on the right. */
export function UpcomingRow({ when, title, detail, status, now = new Date(), hideDay = false, children }) {
  const date = when ? new Date(when) : null;
  return (
    <li className="hb-sched-row" data-status={status || undefined}>
      <div className="hb-sched-when">
        {date ? (
          <>
            <span className="hb-sched-clock">{clockWords(`${date.getHours()}:${date.getMinutes()}`)}</span>
            {!hideDay && <span className="hb-sched-day">{dayWord(date, now)}</span>}
          </>
        ) : <span className="hb-sched-day">Not planned</span>}
      </div>
      <div className="hb-sched-main">
        {title && <div className="hb-sched-title">{title}</div>}
        {detail && <div className="hb-sched-detail">{detail}</div>}
        {children}
      </div>
      {date && !title && (!status || status === 'active' || status === 'running') && <span className="hb-sched-soon">{fromNow(date, now)}</span>}
    </li>
  );
}

/**
 * The shared "coming up" list. `items` are { key, when, title, detail, status,
 * render } and are shown soonest first; `grouped` adds Today / Tomorrow / This
 * week / Later headings.
 */
export function UpcomingList({ items, grouped = false, empty = 'Nothing coming up.', label, now = new Date() }) {
  const sorted = [...items].sort((a, b) => new Date(a.when || 8.64e15) - new Date(b.when || 8.64e15));
  if (!sorted.length) return <p className="hb-sched-empty">{empty}</p>;
  const groups = [];
  for (const item of sorted) {
    const name = grouped && item.when ? dayBucket(item.when, now) : '';
    if (!groups.length || groups[groups.length - 1].name !== name) groups.push({ name, items: [] });
    groups[groups.length - 1].items.push(item);
  }
  return (
    <div className="hb-sched-upcoming" aria-label={label}>
      {groups.map((g) => (
        <section key={g.name || 'all'}>
          {g.name && <h4 className="hb-sched-group">{g.name}</h4>}
          <ul className="hb-sched-rows">
            {g.items.map((item, i) => (
              <UpcomingRow key={item.key} when={item.when} title={item.title} detail={item.detail} status={item.status} now={now}
                hideDay={sameDay(item.when, i ? g.items[i - 1].when : null, now) || (item.when && g.name === dayWord(item.when, now))}>
                {item.render?.()}
              </UpcomingRow>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** A compact "next runs" preview: the sentence, then the next few times. */
export function NextRuns({ sentence, runs, now = new Date() }) {
  return (
    <div className="hb-sched-preview">
      <div className="hb-sched-sentence">{sentence}</div>
      {runs.length ? (
        <ul className="hb-sched-rows">
          {runs.map((d, i) => <UpcomingRow key={d.getTime()} when={d} now={now} hideDay={sameDay(d, runs[i - 1], now)} />)}
        </ul>
      ) : <p className="hb-sched-empty">That time has already passed.</p>}
    </div>
  );
}
