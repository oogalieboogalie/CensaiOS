import React from 'react';
import { Icon } from '../Icons.jsx';
import { SCHEDULER_AGENTS } from './useScheduler.js';

export function SchedulerList({ state, onSpawn, onSelect, wins }) {
  const {
    loading, schedules, groupedTimeline,
    handleToggleStatus, handleDeleteSchedule,
    getSelectedDaysString, fetchSchedules,
  } = state;

  return (
    <div style={{ width: '55%', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Scheduled Tasks</span>
        <button onClick={fetchSchedules} style={{ all: 'unset', cursor: 'pointer', color: 'var(--accent)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
          Refresh
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, paddingRight: 4 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: 'var(--ink-faint)' }}>Loading schedule items...</div>
        ) : schedules.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', fontSize: 12, color: 'var(--ink-faint)', border: '1px dashed var(--hairline)', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, background: 'var(--surface-2)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <span>No active schedules. Use the form to start one!</span>
          </div>
        ) : (
          groupedTimeline.map(([dayName, items]) => (
            <div key={dayName} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', borderBottom: '1px solid var(--hairline)', paddingBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                {dayName}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.map(s => {
                  const agent = SCHEDULER_AGENTS.find(a => a.id === s.agent_id) || SCHEDULER_AGENTS[0];
                  const hue = agent.hue ?? 145;
                  const isCompleted = s.status === 'completed';
                  const isInactive = s.status === 'inactive';
                  const isRunning = s.status === 'running';
                  const isFailed = s.status === 'failed';
                  const statusLabel = isRunning ? 'Running' : isFailed ? 'Failed' : isCompleted ? 'Done' : isInactive ? 'Inactive' : 'Active';
                  return (
                    <div key={s.id} style={{ background: isInactive ? 'var(--surface-2)' : 'var(--surface)', border: `1px solid ${isCompleted ? 'var(--accent)' : 'var(--hairline)'}`, borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6, boxShadow: 'var(--shadow-card)', opacity: isInactive ? 0.6 : 1, position: 'relative', transition: 'opacity 0.2s, border-color 0.2s' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}>{s.scheduled_time}</span>
                          <span style={{ fontSize: 9.5, textTransform: 'lowercase', background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 4, padding: '1px 5px', color: 'var(--ink-soft)', fontWeight: 500 }}>
                            {s.repeat_enabled ? (s.repeat_freq === 'weekly' ? 'weekly-cron' : 'monthly-cron') : 'one-shot'}
                          </span>
                          {s.github_url && (
                            <a href={s.github_url} target="_blank" rel="noreferrer" title={`GitHub Issue #${s.github_number}`} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9.5, color: 'var(--accent-ink)', background: 'var(--accent-soft)', border: '1px solid var(--accent)', borderRadius: 4, padding: '1px 5px', textDecoration: 'none', fontWeight: 600 }}>
                              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>
                              #{s.github_number}
                            </a>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'capitalize', background: `oklch(from oklch(0.62 0.14 ${hue}) l c h / 0.12)`, color: `oklch(0.52 0.14 ${hue})`, border: `1px solid oklch(0.62 0.14 ${hue} / 0.3)`, borderRadius: 6, padding: '2px 8px' }}>
                            Manager: {agent.name}
                          </span>
                          <div title={statusLabel} style={{ width: 8, height: 8, borderRadius: '50%', background: isFailed ? 'var(--ps-red)' : isCompleted ? 'var(--accent)' : isInactive ? 'var(--hairline-strong)' : 'var(--ps-green)', boxShadow: isInactive ? 'none' : `0 0 6px ${isFailed ? 'var(--ps-red)' : isCompleted ? 'var(--accent)' : 'var(--ps-green)'}` }} />
                        </div>
                      </div>

                      <div style={{ fontSize: 12.5, lineHeight: 1.4, color: 'var(--ink)', textDecoration: isCompleted ? 'line-through' : 'none', wordBreak: 'break-word' }}>{s.task_text}</div>

                      {s.document_target && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                          <button onClick={() => onSpawn?.('doc', { fileName: s.document_target, maximized: true })} style={{ all: 'unset', cursor: 'pointer', fontSize: 11, color: 'var(--accent-ink)', background: 'var(--accent-soft)', border: '1px solid var(--accent)', borderRadius: 6, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                            <Icon.Files size={12} />
                            Open {s.document_target}
                          </button>
                        </div>
                      )}

                      {(s.lastResult || s.lastError || s.startedAt || s.lastRunAt) && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, background: 'var(--surface-2)', border: `1px solid ${isFailed ? 'var(--ps-red)' : 'var(--hairline)'}`, borderRadius: 6, padding: '7px 8px', fontSize: 11, color: isFailed ? 'var(--ps-red)' : 'var(--ink-soft)', lineHeight: 1.35 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 9.5, textTransform: 'uppercase' }}>
                            <span>{statusLabel}</span>
                            <span>{s.lastRunAt ? new Date(s.lastRunAt).toLocaleString() : s.startedAt ? new Date(s.startedAt).toLocaleString() : ''}</span>
                          </div>
                          {(s.lastError || s.lastResult) && (
                            <div style={{ color: isFailed ? 'var(--ps-red)' : 'var(--ink)', whiteSpace: 'pre-wrap', maxHeight: 110, overflow: 'auto' }}>{s.lastError || s.lastResult}</div>
                          )}
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed var(--hairline)', paddingTop: 6, marginTop: 2 }}>
                        <div style={{ fontSize: 9.5, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }}>
                          {s.repeat_enabled ? (
                            <span>🔁 repeats {s.repeat_freq} on: {getSelectedDaysString(s.repeat_days)}</span>
                          ) : (
                            <span>📅 project: {s.project_name}</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => {
                              const calWin = wins?.find(w => w.kind === 'calendar');
                              const prefill = {
                                title: `Task: ${s.task_text.slice(0, 40)}`,
                                description: `${s.task_text}\n\nhb://task/${s.id}`,
                                date: s.scheduled_date,
                                startTime: s.scheduled_time.includes('AM') || s.scheduled_time.includes('PM')
                                  ? (function () {
                                      const [t, ap] = s.scheduled_time.split(' ');
                                      let [h, m] = t.split(':');
                                      if (ap === 'PM' && h !== '12') h = parseInt(h) + 12;
                                      if (ap === 'AM' && h === '12') h = '00';
                                      return `${String(h).padStart(2, '0')}:${m}`;
                                    })()
                                  : '09:00',
                                endTime: '10:00'
                              };
                              onSpawn('calendar', { data: { prefill } });
                              if (calWin) onSelect(calWin.id);
                            }}
                            title="Add to Google Calendar"
                            style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: 'var(--ps-red)', background: 'oklch(from var(--ps-red) l c h / 0.1)', padding: '2px 6px', borderRadius: 4, fontWeight: 500 }}
                          >Calendar</button>
                          <button onClick={() => handleToggleStatus(s.id)} title={isCompleted || isFailed ? 'Mark Active' : isInactive ? 'Mark Completed' : 'Mark Inactive'} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: 'var(--accent-ink)', background: 'var(--accent-soft)', padding: '2px 6px', borderRadius: 4, fontWeight: 500 }}>
                            {isCompleted || isFailed ? 'Active' : isInactive ? 'Complete' : 'Pause'}
                          </button>
                          <button onClick={() => handleDeleteSchedule(s.id)} title="Delete scheduled task" style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: 'var(--ps-red)', background: 'var(--ps-red)15', padding: '2px 6px', borderRadius: 4, fontWeight: 500 }}>Delete</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
