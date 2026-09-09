import React from 'react';
import { SchedulerTimelineItem } from './SchedulerTimelineItem.jsx';

export function SchedulerTimeline({ state, onSpawn, onSelect, wins }) {
  const {
    loading, schedules, groupedTimeline,
    handleToggleStatus, handleDeleteSchedule
  } = state;

  return (
    <div style={{
      flex: 1,
      background: 'var(--surface)',
      position: 'relative',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--hairline)', background: 'var(--surface-2)' }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Timeline</h3>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 24 }}>
        {loading && schedules.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink-soft)', fontSize: 12 }}>
            Loading schedules...
          </div>
        ) : schedules.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink-soft)', fontSize: 12 }}>
            No upcoming scheduled tasks.
          </div>
        ) : (
          groupedTimeline.map(([dayName, daySchedules]) => (
            <div key={dayName} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Day Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap' }}>
                  {dayName}
                </span>
                <div style={{ flex: 1, height: 1, background: 'var(--hairline)' }} />
              </div>

              {/* Tasks for the day */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {daySchedules.map(s => (
                  <SchedulerTimelineItem
                    key={s.id}
                    s={s}
                    onSpawn={onSpawn}
                    onSelect={onSelect}
                    wins={wins}
                    handleToggleStatus={handleToggleStatus}
                    handleDeleteSchedule={handleDeleteSchedule}
                  />
                ))}
              </div>

            </div>
          ))
        )}
      </div>
    </div>
  );
}
