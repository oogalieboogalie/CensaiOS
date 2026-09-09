import React from 'react';
import { Icon } from '../Icons.jsx';
import { SCHEDULER_AGENTS, getSelectedDaysString } from './constants.js';

export function SchedulerTimelineItem({ s, onSpawn, onSelect, wins, handleToggleStatus, handleDeleteSchedule }) {
  const isCompleted = s.status === 'completed';
  const isFailed = s.status === 'failed';
  const isInactive = s.status === 'inactive';
  const isRunning = s.status === 'running';
  const lastError = s.last_error || s.lastError || '';
  const lastResult = s.last_result || s.lastResult || '';

  const statusLabel = isRunning ? 'Running' : isCompleted ? 'Completed' : isFailed ? 'Failed' : isInactive ? 'Paused' : 'Scheduled';

  const agent = SCHEDULER_AGENTS.find(a => a.id === s.agent_id) || SCHEDULER_AGENTS[0];
  const hue = agent.hue ?? 145;

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--hairline)',
      borderRadius: 12,
      padding: '12px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      opacity: isCompleted || isInactive ? 0.6 : 1,
      transition: 'opacity 0.2s ease',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Time & Agent Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon.Calendar size={14} color="var(--ink-soft)" />
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{s.scheduled_time}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            color: `oklch(0.42 0.14 ${hue})`,
            background: `oklch(0.92 0.04 ${hue})`,
            border: `1px solid oklch(0.62 0.14 ${hue} / 0.3)`,
            borderRadius: 6,
            padding: '2px 8px'
          }}>
            Manager: {agent.name}
          </span>
          <div
            title={statusLabel}
            style={{
              width: 8, height: 8, borderRadius: '50%',
              background: isFailed ? 'var(--ps-red)' : isCompleted ? 'var(--accent)' : isInactive ? 'var(--hairline-strong)' : 'var(--ps-green)',
              boxShadow: isInactive ? 'none' : `0 0 6px ${isFailed ? 'var(--ps-red)' : isCompleted ? 'var(--accent)' : 'var(--ps-green)'}`
            }}
          />
        </div>
      </div>

      <div style={{
        fontSize: 12.5, lineHeight: 1.4, color: 'var(--ink)',
        textDecoration: isCompleted ? 'line-through' : 'none', wordBreak: 'break-word'
      }}>
        {s.task_text}
      </div>

      {s.document_target && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
           <button
            onClick={() => onSpawn?.('doc', { fileName: s.document_target, maximized: true })}
            style={{
              all: 'unset', cursor: 'pointer', fontSize: 11, color: 'var(--accent-ink)',
              background: 'var(--accent-soft)', border: '1px solid var(--accent)',
              borderRadius: 6, padding: '4px 10px', display: 'flex', alignItems: 'center',
              gap: 6, fontWeight: 600, boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }}
          >
            <Icon.Files size={12} />
            Open {s.document_target}
          </button>
        </div>
      )}

      {(lastResult || lastError || s.startedAt || s.lastRunAt || s.last_run_id) && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 4, background: 'var(--surface-2)',
          border: `1px solid ${isFailed ? 'var(--ps-red)' : 'var(--hairline)'}`, borderRadius: 6,
          padding: '7px 8px', fontSize: 11, color: isFailed ? 'var(--ps-red)' : 'var(--ink-soft)', lineHeight: 1.35
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 9.5, textTransform: 'uppercase' }}>
            <span>{statusLabel}</span>
            <span>{s.lastRunAt ? new Date(s.lastRunAt).toLocaleString() : s.startedAt ? new Date(s.startedAt).toLocaleString() : ''}</span>
          </div>
          {(lastError || lastResult) && (
            <div style={{ color: isFailed ? 'var(--ps-red)' : 'var(--ink)', whiteSpace: 'pre-wrap', maxHeight: 110, overflow: 'auto' }}>
              {lastError || lastResult}
            </div>
          )}
          {s.last_run_id && (
            <div style={{ color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)', fontSize: 9.5 }}>
              Run {s.last_run_id.slice(0, 8)}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
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
                  ? (function(){
                      const [t, ampm] = s.scheduled_time.split(' ');
                      let [h, m] = t.split(':');
                      if (ampm === 'PM' && h !== '12') h = parseInt(h) + 12;
                      if (ampm === 'AM' && h === '12') h = '00';
                      return `${String(h).padStart(2, '0')}:${m}`;
                    })()
                  : '09:00',
                endTime: '10:00'
              };
              onSpawn?.('calendar', { data: { prefill } });
              if (calWin) onSelect?.(calWin.id);
            }}
            title="Add to Google Calendar"
            style={{
              all: 'unset', cursor: 'pointer', fontSize: 10, color: 'var(--ps-red)',
              background: 'oklch(from var(--ps-red) l c h / 0.1)', padding: '2px 6px', borderRadius: 4, fontWeight: 500
            }}
          >
            Calendar
          </button>
          <button
            onClick={() => handleToggleStatus(s.id)}
            title={isCompleted || isFailed ? 'Mark Active' : isInactive ? 'Mark Completed' : 'Mark Inactive'}
            style={{
              all: 'unset', cursor: 'pointer', fontSize: 10, color: 'var(--accent-ink)',
              background: 'var(--accent-soft)', padding: '2px 6px', borderRadius: 4, fontWeight: 500
            }}
          >
            {isCompleted || isFailed ? 'Active' : isInactive ? 'Complete' : 'Pause'}
          </button>
          <button
            onClick={() => handleDeleteSchedule(s.id)}
            title="Delete scheduled task"
            style={{
              all: 'unset', cursor: 'pointer', fontSize: 10, color: 'var(--ps-red)',
              background: 'var(--ps-red)15', padding: '2px 6px', borderRadius: 4, fontWeight: 500
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
