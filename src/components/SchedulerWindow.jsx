import React from 'react';
import { WindowTitle } from './Windows.jsx';
import { useScheduler } from './scheduler/useScheduler.js';
import { SchedulerForm } from './scheduler/SchedulerForm.jsx';
import { SchedulerTimeline } from './scheduler/SchedulerTimeline.jsx';

export function SchedulerWindow({ win, onUpdate, onSpawn, onSelect, wins, currentProject, isActive }) {
  const state = useScheduler(currentProject, isActive);

  return (
    <>
      <WindowTitle
        icon="Clock"
        label="Task Scheduler"
      />
      <div style={{
        flex: 1,
        display: 'flex',
        minHeight: 0,
        background: 'var(--surface)',
        color: 'var(--ink)'
      }}>
        <SchedulerForm state={state} />
        <SchedulerTimeline state={state} onSpawn={onSpawn} onSelect={onSelect} wins={wins} />
      </div>
    </>
  );
}
