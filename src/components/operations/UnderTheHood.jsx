import React from 'react';
import {
  RUNNING_TASK_STATUSES,
  ACTIVE_JULES_STATUSES,
  countByStatus,
  buildActiveAgents,
} from './OperationsShared.jsx';
import { healthFlag } from '../../lib/healthFlag.js';
import { MetricsView } from './MetricsView.jsx';
import { RuntimePanel } from './RuntimePanel.jsx';
import { ActiveAgentsPanel } from './ActiveAgentsPanel.jsx';
import { JulesPanel } from './JulesPanel.jsx';
import { SchedulerPanel } from './SchedulerPanel.jsx';
import { TaskQueuePanel } from './TaskQueuePanel.jsx';

/**
 * The technical view the Live Operations window used to open on: service
 * health, background workers, the full task queue and Jules sessions.
 * Kept one click away for whoever runs the machine.
 */
export function UnderTheHood({ state, hasWorkspace, includeCompleted, setIncludeCompleted }) {
  const taskCounts = React.useMemo(() => countByStatus(state.tasks), [state.tasks]);
  const scheduleCounts = React.useMemo(() => countByStatus(state.schedules), [state.schedules]);
  const activeTasks = state.tasks.filter((task) => RUNNING_TASK_STATUSES.has(task.status || 'queued'));
  const activeSchedules = state.schedules.filter((schedule) => ['running', 'active'].includes(schedule.status || 'active'));
  const activeJules = state.jules.filter((session) => ACTIVE_JULES_STATUSES.has(session.status));
  const activeAgents = buildActiveAgents({ tasks: activeTasks, schedules: activeSchedules, jules: activeJules, subAgents: state.subAgents });
  const taskWorker = state.health?.taskWorker || {};
  const schedulerWorker = state.health?.schedulerWorker || {};
  const dbReady = healthFlag(state.health, (health) => {
    if (typeof health.databaseStatus?.ready === 'boolean') return health.databaseStatus.ready;
    if (typeof health.database === 'boolean') return health.database;
    if (typeof health.database?.ready === 'boolean') return health.database.ready;
    return undefined;
  });
  const qdrantReady = healthFlag(state.health, (health) => health.qdrant?.ready);
  const modelReady = healthFlag(state.health, (health) => health.modelProvider?.ready);
  const workerReady = healthFlag(state.health, (health) => health.taskWorker?.ready);
  const schedulerReady = healthFlag(state.health, (health) => health.schedulerWorker?.ready);
  const errorList = Object.values(state.errors).filter(Boolean);

  return (
    <div className="hb-lo-hood">
      <MetricsView
        dbReady={dbReady}
        qdrantReady={qdrantReady}
        modelReady={modelReady}
        schedulerReady={schedulerReady}
        schedulerWorker={schedulerWorker}
        workerReady={workerReady}
        taskWorker={taskWorker}
        activeAgentsCount={activeAgents.length}
      />
      <div className="hb-lo-hood-grid">
        <div className="hb-lo-hood-col">
          <RuntimePanel
            dbReady={dbReady}
            health={state.health}
            schedulerReady={schedulerReady}
            schedulerWorker={schedulerWorker}
            workerReady={workerReady}
            taskWorker={taskWorker}
            errorList={errorList}
            taskCounts={taskCounts}
            tasksLength={state.tasks.length}
          />
          <ActiveAgentsPanel activeAgents={activeAgents} />
        </div>
        <div className="hb-lo-hood-col">
          <JulesPanel jules={state.jules} includeCompleted={includeCompleted} setIncludeCompleted={setIncludeCompleted} />
          {hasWorkspace ? (
            <>
              <SchedulerPanel scheduleCounts={scheduleCounts} schedules={state.schedules} subAgents={state.subAgents} />
              <TaskQueuePanel tasks={state.tasks} subAgents={state.subAgents} />
            </>
          ) : (
            <section className="hb-lo-none">Workspace schedules and agent tasks are unavailable until a workspace is open.</section>
          )}
        </div>
      </div>
    </div>
  );
}
