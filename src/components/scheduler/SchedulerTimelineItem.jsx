import React from 'react';
import { SCHEDULER_AGENTS } from './constants.js';
import { describeRow, specFromRow } from '../../lib/schedule/fromScheduler.js';
import { fromNow } from '../../lib/schedule/plainWords.js';
import { SchedulerTag } from './SchedulerTagPicker.jsx';
import { useWorkspaceStore } from '../../lib/store.js';

const TOGGLE_WORDS = { active: 'Pause', running: 'Pause', inactive: 'Resume', failed: 'Try again', completed: 'Run again' };

/** What sits next to a run's time in the Scheduler's list. */
export function SchedulerTimelineItem({ s, now = new Date(), onSpawn, onSelect, wins, handleToggleStatus, handleDeleteSchedule }) {
  const agent = SCHEDULER_AGENTS.find(a => a.id === s.agent_id) || SCHEDULER_AGENTS[0];
  const lastError = s.last_error || s.lastError || '';
  const lastResult = s.last_result || s.lastResult || '';
  const lastRun = s.last_run_at || s.lastRunAt;
  const detail = [s.project_name, describeRow(s, now)].filter(Boolean).join(' · ');
  // A wake-up Censai set on his own (for himself, or to wake a family agent).
  const setter = s.set_by_agent ? SCHEDULER_AGENTS.find(a => a.id === s.set_by_agent) : null;

  const addToCalendar = () => {
    const spec = specFromRow(s);
    const [h, m] = spec.time.split(':').map(Number);
    const prefill = {
      title: `Task: ${s.task_text.slice(0, 40)}`,
      description: `${s.task_text}\n\nhb://task/${s.id}`,
      date: spec.date,
      startTime: spec.time,
      endTime: `${String(Math.min(h + 1, 23)).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
    };
    // The canvas hands windows only positions, so look the calendar up on the board.
    const calWin = useWorkspaceStore.getState().wins.find(w => w.kind === 'calendar');
    onSpawn?.('calendar', { data: { prefill } });
    if (calWin) onSelect?.(calWin.id);
  };

  return (
    <>
      <div className="hb-sched-cardhead">
        <SchedulerTag tag={s.tag} />
        <span className="hb-sched-manager">
          Manager: <b style={{ '--agent-hue': agent?.hue ?? 220 }}>{agent?.name}</b>
        </span>
        {setter && (
          <span className="hb-sched-own" title="An agent set this one itself">
            Set by {setter.name}{setter.id === agent?.id ? ' for himself' : ''}
          </span>
        )}
      </div>
      {setter && s.agent_reason && <p className="hb-sched-why">Why: {s.agent_reason}</p>}
      <div className="hb-sched-title">{s.task_text}</div>
      <div className="hb-sched-detail">{detail}</div>
      {s.status === 'running' && <span className="hb-sched-status">Running now</span>}
      {(lastError || lastResult) && (
        <p className="hb-sched-note" data-tone={lastError ? 'danger' : undefined}>
          {lastRun ? `Last run ${fromNow(lastRun, now)}: ` : ''}{lastError || lastResult}
        </p>
      )}
      <div className="hb-sched-actions">
        <button type="button" className="hb-sched-btn" onClick={() => handleToggleStatus(s.id)}>{TOGGLE_WORDS[s.status] || 'Resume'}</button>
        {s.document_target && (
          <button type="button" className="hb-sched-btn" onClick={() => onSpawn?.('doc', { fileName: s.document_target, maximized: true })}>Open {s.document_target}</button>
        )}
        <button type="button" className="hb-sched-btn" title="Add to Google Calendar" onClick={addToCalendar}>Add to calendar</button>
        <button type="button" className="hb-sched-btn" data-danger="true" onClick={() => handleDeleteSchedule(s.id)}>Delete</button>
      </div>
    </>
  );
}
