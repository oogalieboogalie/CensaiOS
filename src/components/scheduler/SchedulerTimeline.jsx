import React from 'react';
import { UpcomingList } from '../schedule/UpcomingList.jsx';
import { SchedulerTimelineItem } from './SchedulerTimelineItem.jsx';
import { nextRunOf, specFromRow } from '../../lib/schedule/fromScheduler.js';

/** Paused or finished rows still show the time they were planned for. */
const plannedAt = (s) => { const spec = specFromRow(s); return new Date(`${spec.date}T${spec.time}:00`); };

const SECTIONS = [
  ['waiting', 'Coming up', 'Nothing scheduled yet. Pick a time on the left.'],
  ['failed', 'Needs a look', ''],
  ['inactive', 'Paused', ''],
  ['completed', 'Done', ''],
];

const sectionOf = (s) => (s.status === 'active' || s.status === 'running' ? 'waiting' : s.status === 'failed' ? 'failed' : s.status === 'inactive' ? 'inactive' : 'completed');

export function SchedulerTimeline({ state, onSpawn, onSelect, wins }) {
  const { loading, schedules, handleToggleStatus, handleDeleteSchedule } = state;
  const now = new Date();
  const items = schedules.map((s) => ({
    key: s.id,
    section: sectionOf(s),
    when: nextRunOf(s, now) || plannedAt(s),
    status: s.status,
    render: () => (
      <SchedulerTimelineItem s={s} now={now} onSpawn={onSpawn} onSelect={onSelect} wins={wins}
        handleToggleStatus={handleToggleStatus} handleDeleteSchedule={handleDeleteSchedule} />
    ),
  }));

  return (
    <section className="hb-sched-pane" aria-label="Scheduled runs">
      <div className="hb-sched-pane-head">
        <h3 className="hb-sched-pane-title">Coming up</h3>
        <span className="hb-sched-pane-sub">Soonest first</span>
      </div>
      <div className="hb-sched-pane-body">
        {loading && !schedules.length ? (
          <p className="hb-sched-empty">Loading schedules...</p>
        ) : SECTIONS.map(([id, title, empty]) => {
          const list = items.filter((item) => item.section === id);
          if (!list.length && !empty) return null;
          return (
            <div key={id} className="hb-sched-field">
              {id !== 'waiting' && <span className="hb-sched-label">{title}</span>}
              <UpcomingList items={list} grouped={id === 'waiting'} empty={empty} label={title} now={now} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
