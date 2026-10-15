import React from 'react';
import { api } from '../../lib/api.js';
import { useVisibilityAwareInterval } from '../../lib/usePolling.js';
import { normalizeSchedule } from '../operations/OperationsShared.jsx';

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

const EMPTY = {
  health: null, schedules: [], tasks: [], subAgents: [], jules: [],
  liveOps: null, cliTasks: null, devServers: [], errors: {}, lastLoadedAt: null,
};

/**
 * Everything the Live Operations window reads from the server, refreshed
 * every few seconds while the board is on screen. A source this install
 * does not have (no Docker, cloud mode, no workspace) just comes back empty.
 */
export function useLiveOpsData({ workspaceId, isActive, includeCompleted = false }) {
  const hasWorkspace = Boolean(String(workspaceId || '').trim());
  const [state, setState] = React.useState(EMPTY);
  const [refreshing, setRefreshing] = React.useState(false);

  const load = React.useCallback(async ({ refreshJules = false, quiet = false } = {}) => {
    if (!quiet) setRefreshing(true);
    const ws = encodeURIComponent(workspaceId || '');
    const scoped = (url, why) => (hasWorkspace ? readJson(url, []) : Promise.resolve({ error: why, fallback: [] }));
    const [health, schedules, tasks, subAgents, jules, liveOps, cliTasks, dev] = await Promise.all([
      readJson('/api/health', null),
      scoped(`/api/schedules?workspaceId=${ws}`, 'Open a workspace to load its schedules.'),
      scoped(`/api/agent-tasks?workspaceId=${ws}&limit=200`, 'Open a workspace to load its agent tasks.'),
      scoped(`/api/sub-agents?workspaceId=${ws}`, 'Open a workspace to load its sub-agents.'),
      api.getJulesSessions({ refresh: refreshJules, includeCompleted }).catch((err) => ({ error: err.message || 'Failed to load Jules sessions', sessions: [] })),
      hasWorkspace ? readJson(`/api/live-ops/workspaces/${ws}`, null) : Promise.resolve(null),
      readJson('/api/cli-agents/tasks', null),
      readJson('/api/dev-servers', null),
    ]);

    const errors = {};
    if (health?.error) errors.health = health.error;
    if (schedules?.error) errors.schedules = schedules.error;
    if (tasks?.error) errors.tasks = tasks.error;
    if (subAgents?.error) errors.subAgents = subAgents.error;
    if (jules?.error) errors.jules = jules.error;
    if (liveOps?.error) errors.liveOps = liveOps.error;
    const agents = Array.isArray(subAgents) ? subAgents : [];
    const cliList = Array.isArray(cliTasks) ? cliTasks : Array.isArray(cliTasks?.tasks) ? cliTasks.tasks : null;

    setState({
      health: health?.error ? null : health,
      schedules: Array.isArray(schedules) ? schedules.map((s) => normalizeSchedule(s, agents)) : [],
      tasks: Array.isArray(tasks) ? tasks : [],
      subAgents: agents,
      jules: Array.isArray(jules?.sessions) ? jules.sessions : [],
      liveOps: liveOps && !liveOps.error ? liveOps : null,
      cliTasks: cliList,
      devServers: Array.isArray(dev?.servers) ? dev.servers : [],
      errors,
      lastLoadedAt: new Date(),
    });
    setRefreshing(false);
  }, [hasWorkspace, includeCompleted, workspaceId]);

  React.useEffect(() => { load(); }, [load]);
  // A board you glance at, not one you click into: it keeps refreshing while
  // on screen, faster when it is the window in front.
  useVisibilityAwareInterval(() => { load({ quiet: true }); }, isActive ? 5000 : 15000);
  React.useEffect(() => {
    const handleUpdate = () => load();
    window.addEventListener('tasks-updated', handleUpdate);
    return () => window.removeEventListener('tasks-updated', handleUpdate);
  }, [load]);

  return { state, load, refreshing, hasWorkspace };
}
