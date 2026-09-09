import React from 'react';
import { Panel, WorkerLine, StatusBars } from './OperationsShared.jsx';

export function RuntimePanel({ dbReady, health, schedulerReady, schedulerWorker, workerReady, taskWorker, errorList, taskCounts, tasksLength }) {
  const qdrant = health?.qdrant || {};
  const modelProvider = health?.modelProvider || {};
  const runner = health?.runner || {};
  const runnerReady = runner.enabled ? (runner.remote ? !!runner.ok : true) : false;
  const runnerDetail = !runner.enabled
    ? 'Disabled (dangerous tools inactive)'
    : runner.remote
      ? (runner.ok ? `Remote v${runner.version}` : (runner.error || `Error ${runner.status}`))
      : 'Local (host execution fallback)';

  return (
    <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
      <Panel title="Runtime">
        <WorkerLine label="Database" ready={dbReady} detail={health?.database?.error || 'Postgres connection'} />
        <WorkerLine label="AI Provider" ready={modelProvider.ready} detail={modelProvider.model || 'Inference config'} />
        <WorkerLine label="Vector DB" ready={qdrant.ready} detail={qdrant.error || (qdrant.connected ? 'Qdrant online' : 'Optional vector memory')} />
        <WorkerLine label="Scheduler" ready={schedulerReady} detail={schedulerWorker.lastPollError || `${schedulerWorker.pollIntervalMs || 0}ms poll`} />
        <WorkerLine label="Agent queue" ready={workerReady} detail={taskWorker.lastPollError || taskWorker.message || `${taskWorker.pollIntervalMs || 0}ms poll`} />
        <WorkerLine label="Work plane" ready={runnerReady} detail={runnerDetail} />
        {errorList.length > 0 && (
          <div style={{ marginTop: 8, display: 'grid', gap: 5 }}>
            {errorList.map((error, index) => (
              <div key={`${error}-${index}`} style={{ fontSize: 11, color: 'var(--ps-red)', lineHeight: 1.35, overflowWrap: 'anywhere' }}>{error}</div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Queue Health">
        <StatusBars counts={taskCounts} total={tasksLength} />
      </Panel>
    </div>
  );
}
