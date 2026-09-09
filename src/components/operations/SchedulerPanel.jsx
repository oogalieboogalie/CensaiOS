import React from 'react';
import { Panel, StatusBars, CompactList, Row, statusTone, fmtTime } from './OperationsShared.jsx';
import { getAgentById } from '../../lib/agentStore.js';

export function SchedulerPanel({ scheduleCounts, schedules, subAgents = [] }) {
  return (
    <Panel title="Scheduler Status">
      <StatusBars counts={scheduleCounts} total={schedules.length} />
      <CompactList
        items={schedules.slice(0, 8)}
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
                schedule.nextRunAt ? `next ${fmtTime(schedule.nextRunAt)}` : `${schedule.date || ''} ${schedule.time || ''}`.trim()
              ].filter(Boolean).join(' · ')}
              right={schedule.lastError ? 'error' : schedule.lastRunAt ? fmtTime(schedule.lastRunAt) : ''}
            />
          );
        }}
      />
    </Panel>
  );
}
