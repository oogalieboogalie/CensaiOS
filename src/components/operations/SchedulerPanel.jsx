import React from 'react';
import { Panel, StatusBars, CompactList, Row, statusTone, fmtTime } from './OperationsShared.jsx';
import { getAgentById } from '../../lib/agentStore.js';
import { describeRow } from '../../lib/schedule/fromScheduler.js';
import { whenWords } from '../../lib/schedule/plainWords.js';

// Soonest run first; paused and finished ones after.
const soonest = (a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1)
  || new Date(a.nextRunAt || 8.64e15) - new Date(b.nextRunAt || 8.64e15);

export function SchedulerPanel({ scheduleCounts, schedules, subAgents = [] }) {
  return (
    <Panel title="Scheduler Status">
      <StatusBars counts={scheduleCounts} total={schedules.length} />
      <CompactList
        items={[...schedules].sort(soonest).slice(0, 8)}
        empty="No scheduled tasks."
        render={(schedule) => {
          const agent = getAgentById(schedule.agentId);
          const subAgent = subAgents.find(item => item.id === schedule.agentId);
          return (
            <Row
              key={schedule.id}
              dotTone={statusTone(schedule.status || 'active')}
              title={schedule.taskText || 'Untitled scheduled task'}
              meta={[
                schedule.status || 'active',
                schedule.agentName || subAgent?.name || agent?.name || schedule.agentId,
                schedule.projectName,
                schedule.scheduled_time ? describeRow(schedule) : null,
                schedule.status === 'active' && schedule.nextRunAt ? `next ${whenWords(schedule.nextRunAt, new Date(), { capital: false })}` : null
              ].filter(Boolean).join(' · ')}
              right={schedule.lastError ? 'error' : schedule.lastRunAt ? fmtTime(schedule.lastRunAt) : ''}
            />
          );
        }}
      />
    </Panel>
  );
}
