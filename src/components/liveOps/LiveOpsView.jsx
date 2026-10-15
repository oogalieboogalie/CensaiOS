import React from 'react';
import { money, STATE_LABELS } from '../../lib/liveOps/feed.js';
import { LiveOpsRow } from './LiveOpsRow.jsx';

const SECTIONS = ['needs_you', 'failed', 'running', 'upcoming', 'done'];
const FIRST_SHOWN = { needs_you: 20, failed: 6, running: 20, upcoming: 4, done: 6 };

const EMPTY_TEXT = {
  needs_you: 'Nothing is waiting on a person.',
  failed: 'Nothing failed in the last day.',
  running: 'Nothing is running right now.',
  upcoming: 'Nothing is scheduled.',
  done: 'Nothing finished in the last day.',
};

function Tile({ state, value, label, picked, onPick }) {
  return (
    <button type="button" className="hb-lo-tile" data-state={state} data-picked={picked} aria-pressed={picked} onClick={() => onPick(picked ? 'all' : state)}>
      <span className="hb-lo-tile-value">{value}</span>
      <span className="hb-lo-tile-label">{label}</span>
    </button>
  );
}

/**
 * The at-a-glance view: five numbers across the top (each one a filter),
 * then the list, with what needs a person first and what failed next.
 */
export function LiveOpsView({ feed, now, onOpen, canOpen }) {
  const [filter, setFilter] = React.useState('all');
  const [expanded, setExpanded] = React.useState({});
  const { items, counts, finishedToday, spentToday } = feed;
  const sections = filter === 'all' ? SECTIONS : [filter];
  const spent = spentToday.priced ? money(spentToday.usd) : '$0';

  return (
    <div className="hb-lo">
      <div className="hb-lo-tiles" role="group" aria-label="At a glance">
        <Tile state="running" value={counts.running} label="Running now" picked={filter === 'running'} onPick={setFilter} />
        <Tile state="needs_you" value={counts.needs_you} label="Needs you" picked={filter === 'needs_you'} onPick={setFilter} />
        <Tile state="failed" value={counts.failed} label="Failed" picked={filter === 'failed'} onPick={setFilter} />
        <Tile state="done" value={finishedToday} label="Finished today" picked={filter === 'done'} onPick={setFilter} />
        <Tile state="upcoming" value={counts.upcoming} label="Coming up" picked={filter === 'upcoming'} onPick={setFilter} />
        <div className="hb-lo-tile hb-lo-spent" title="Only runs that report a price are counted: Agent Console tasks and Model arena races.">
          <span className="hb-lo-tile-value">{spent}</span>
          <span className="hb-lo-tile-label">Spent today</span>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="hb-lo-empty">
          <strong>All quiet.</strong> When an agent, workflow, schedule, coding agent or dev server starts, it shows up here for everyone on the board.
        </div>
      ) : (
        <div className="hb-lo-sections">
          {sections.map((state) => {
            const rows = items.filter((i) => i.state === state);
            if (!rows.length && filter === 'all' && state !== 'running') return null;
            const limit = expanded[state] ? rows.length : FIRST_SHOWN[state];
            return (
              <section key={state} className="hb-lo-section" aria-label={STATE_LABELS[state]}>
                <h3 className="hb-lo-heading" data-state={state}>
                  {STATE_LABELS[state]} <span className="hb-lo-count">{rows.length}</span>
                </h3>
                {rows.length === 0 ? <div className="hb-lo-none">{EMPTY_TEXT[state]}</div> : (
                  <ul className="hb-lo-list">
                    {rows.slice(0, limit).map((item) => (
                      <LiveOpsRow key={item.id} item={item} now={now} onOpen={onOpen} openable={canOpen(item)} />
                    ))}
                  </ul>
                )}
                {rows.length > limit && (
                  <button type="button" className="hb-lo-link" onClick={() => setExpanded((e) => ({ ...e, [state]: true }))}>
                    Show {rows.length - limit} more
                  </button>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
