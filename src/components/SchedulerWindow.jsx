import React from 'react';
import { WindowTitle } from './Windows.jsx';
import { Icon } from './Icons.jsx';
import { useScheduler } from './scheduler/useScheduler.js';
import { SchedulerForm } from './scheduler/SchedulerForm.jsx';
import { SchedulerTimeline } from './scheduler/SchedulerTimeline.jsx';

export function SchedulerWindow({ win, onUpdate, onSpawn, onSelect, wins, currentProject, isActive }) {
  const state = useScheduler(currentProject, isActive);
  const waiting = state.schedules.filter((s) => s.status === 'active' || s.status === 'running').length;

  return (
    <>
      <WindowTitle
        icon={<Icon.Calendar size={14} />}
        label="Scheduler"
        subtitle={waiting ? `${waiting} coming up` : undefined}
      />
      <div className="hb-sched-window">
        <SchedulerForm state={state} />
        <SchedulerTimeline state={state} onSpawn={onSpawn} onSelect={onSelect} wins={wins} />
      </div>
    </>
  );
}
