import React from 'react';
import { Icon } from './Icons.jsx';
import { WindowTitle } from './Windows.jsx';
import { api } from '../lib/api.js';
import {
  RUNNING_TASK_STATUSES,
  ACTIVE_JULES_STATUSES,
  fmtTime,
  countByStatus,
  iconButtonStyle,
  buildActiveAgents,
  normalizeSchedule
} from './operations/OperationsShared.jsx';

import { MetricsView } from './operations/MetricsView.jsx';
import { RuntimePanel } from './operations/RuntimePanel.jsx';
import { ActiveAgentsPanel } from './operations/ActiveAgentsPanel.jsx';
import { JulesPanel } from './operations/JulesPanel.jsx';
import { SchedulerPanel } from './operations/SchedulerPanel.jsx';
import { TaskQueuePanel } from './operations/TaskQueuePanel.jsx';
import { useVisibilityAwareInterval } from '../lib/usePolling.js';

async function readJson(url, fallback) {
  try {
    const res = await fetch(url);
    const data = await res.json().catch(() => fallback);
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return data;
  } catch (err) {
    return { error: err.message || 'Request failed', fallback };
  }
}

import { useWorkspaceStore } from '../lib/store.js';

export function OperationsBoardWindow({ win, onUpdate, isActive }) {
  const spawnAt = useWorkspaceStore(state => state.spawnAt);
  const workspaceId = useWorkspaceStore(state => state.workspaceId);
  const hasWorkspace = Boolean(String(workspaceId || '').trim());
  const [state, setState] = React.useState({
    health: null,
    schedules: [],
    tasks: [],
    subAgents: [],
    jules: [],
    errors: {},
    lastLoadedAt: null,
  });
  const [includeCompleted, setIncludeCompleted] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  const load = React.useCallback(async ({ refreshJules = false, quiet = false } = {}) => {
    if (!quiet) setRefreshing(true);
    const [health, schedules, taskPayload, subAgentPayload, julesPayload] = await Promise.all([
      readJson('/api/health', null),
      hasWorkspace
        ? readJson(`/api/schedules?workspaceId=${encodeURIComponent(workspaceId)}`, [])
        : { error: 'Open a workspace to load its schedules.', fallback: [] },
      hasWorkspace
        ? readJson(`/api/agent-tasks?workspaceId=${encodeURIComponent(workspaceId)}&limit=200`, [])
        : { error: 'Open a workspace to load its agent tasks.', fallback: [] },
      hasWorkspace
        ? readJson(`/api/sub-agents?workspaceId=${encodeURIComponent(workspaceId)}`, [])
        : { error: 'Open a workspace to load its sub-agents.', fallback: [] },
      api.getJulesSessions({ refresh: refreshJules, includeCompleted }).catch(err => ({ error: err.message || 'Failed to load Jules sessions', sessions: [] })),
    ]);

    const errors = {};
    if (health?.error) errors.health = health.error;
    if (schedules?.error) errors.schedules = schedules.error;
    if (taskPayload?.error) errors.tasks = taskPayload.error;
    if (subAgentPayload?.error) errors.subAgents = subAgentPayload.error;
    if (julesPayload?.error) errors.jules = julesPayload.error;

    setState({
      health: health?.error ? null : health,
      schedules: Array.isArray(schedules) ? schedules.map(schedule => normalizeSchedule(schedule, Array.isArray(subAgentPayload) ? subAgentPayload : [])) : [],
      tasks: Array.isArray(taskPayload) ? taskPayload : [],
      subAgents: Array.isArray(subAgentPayload) ? subAgentPayload : [],
      jules: Array.isArray(julesPayload?.sessions) ? julesPayload.sessions : [],
      errors,
      lastLoadedAt: new Date(),
    });
    setRefreshing(false);
  }, [hasWorkspace, includeCompleted, workspaceId]);

  React.useEffect(() => {
    load();
  }, [load]);

  useVisibilityAwareInterval(() => {
    load({ quiet: true });
  }, 5000, { inactive: !isActive });

  React.useEffect(() => {
    const handleUpdate = () => load();
    window.addEventListener('tasks-updated', handleUpdate);
    return () => {
      window.removeEventListener('tasks-updated', handleUpdate);
    };
  }, [load]);

  const taskCounts = React.useMemo(() => countByStatus(state.tasks), [state.tasks]);
  const scheduleCounts = React.useMemo(() => countByStatus(state.schedules), [state.schedules]);
  const activeTasks = state.tasks.filter(task => RUNNING_TASK_STATUSES.has(task.status || 'queued'));
  const activeSchedules = state.schedules.filter(schedule => ['running', 'active'].includes(schedule.status || 'active'));
  const activeJules = state.jules.filter(session => ACTIVE_JULES_STATUSES.has(session.status));
  const activeAgents = buildActiveAgents({ tasks: activeTasks, schedules: activeSchedules, jules: activeJules, subAgents: state.subAgents });
  const taskWorker = state.health?.taskWorker || {};
  const schedulerWorker = state.health?.schedulerWorker || {};
  const dbReady = Boolean(state.health?.database?.ready ?? state.health?.databaseStatus?.ready ?? state.health?.database);
  const qdrantReady = Boolean(state.health?.qdrant?.ready);
  const modelReady = Boolean(state.health?.modelProvider?.ready);
  const workerReady = Boolean(taskWorker.ready);
  const schedulerReady = Boolean(schedulerWorker.ready);
  const errorList = Object.values(state.errors).filter(Boolean);

  return (
    <>
      <WindowTitle
        icon={<Icon.Tools size={14} />}
        label={win.title || 'Live Operations'}
        subtitle={state.lastLoadedAt ? `updated ${fmtTime(state.lastLoadedAt)}` : 'loading'}
        attachedAgentIds={win.attachedAgents}
        onDetach={(id) => onUpdate?.({ attachedAgents: (win.attachedAgents || []).filter(a => a !== id) })}
      >
        <button
          type="button"
          title="View Agent Traces"
          onClick={() => spawnAt('agent_trace', { title: 'Agentic Tracing' })}
          style={iconButtonStyle(false)}
        >
          <Icon.Search size={13} />
        </button>
        <button
          type="button"
          title="Refresh operations board"
          onClick={() => load({ refreshJules: true })}
          disabled={refreshing}
          style={iconButtonStyle(refreshing)}
        >
          <Icon.Refresh size={13} />
        </button>
      </WindowTitle>

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'grid', gridTemplateRows: 'auto 1fr', background: 'var(--surface)', color: 'var(--ink)' }}>
        {!hasWorkspace && (
          <div role="status" style={{ margin: '10px 12px 0', padding: '8px 10px', border: '1px solid var(--hairline)', borderRadius: 8, background: 'var(--surface-raised)', color: 'var(--ink-soft)', fontSize: 12 }}>
            Open a workspace to scope schedules and agent tasks. Runtime health remains visible.
          </div>
        )}
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

        <div style={{ minHeight: 0, overflow: 'auto', padding: 12, display: 'grid', gridTemplateColumns: 'minmax(250px, 0.9fr) minmax(360px, 1.4fr)', gap: 12, alignContent: 'start' }}>
          <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
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

          <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
            <JulesPanel
              jules={state.jules}
              includeCompleted={includeCompleted}
              setIncludeCompleted={setIncludeCompleted}
            />

            {hasWorkspace ? (
              <>
                <SchedulerPanel
                  scheduleCounts={scheduleCounts}
                  schedules={state.schedules}
                  subAgents={state.subAgents}
                />

                <TaskQueuePanel
                  tasks={state.tasks}
                  subAgents={state.subAgents}
                />
              </>
            ) : (
              <section style={{ border: '1px solid var(--hairline)', borderRadius: 10, padding: 12, background: 'var(--surface-raised)', color: 'var(--ink-soft)', fontSize: 12 }}>
                Workspace schedules and agent tasks are unavailable until a workspace is open.
              </section>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
