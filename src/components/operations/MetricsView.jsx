import React from 'react';
import { Metric } from './OperationsShared.jsx';

export function MetricsView({ dbReady, schedulerReady, schedulerWorker, workerReady, taskWorker, activeAgentsCount, qdrantReady, modelReady }) {
  return (
    <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--hairline)', display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 8 }}>
      <Metric label="DB" value={dbReady ? 'ready' : 'blocked'} tone={dbReady ? 'good' : 'bad'} />
      <Metric label="AI" value={modelReady ? 'ready' : 'blocked'} tone={modelReady ? 'good' : 'bad'} />
      <Metric label="Vector" value={qdrantReady ? 'ready' : 'off'} tone={qdrantReady ? 'good' : 'quiet'} />
      <Metric label="Scheduler" value={schedulerReady ? schedulerWorker.activeScheduleId ? 'running' : 'ready' : 'blocked'} tone={schedulerReady ? schedulerWorker.activeScheduleId ? 'live' : 'good' : 'bad'} />
      <Metric label="Task worker" value={workerReady ? `${taskWorker.activeCount || 0}/${taskWorker.maxConcurrent || 0}` : 'blocked'} tone={workerReady ? taskWorker.activeCount ? 'live' : 'good' : 'bad'} />
      <Metric label="Active" value={activeAgentsCount} tone={activeAgentsCount ? 'live' : 'quiet'} />
    </div>
  );
}
