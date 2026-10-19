import React from 'react';
import { cliAgentsApi } from '../../agentConsole/cliAgentsApi.js';
import { parsePatch } from '../../agentConsole/lineDiff.js';

/** The agent tasks to pick from, and the chosen task's changed files. */
export function useGitDiff(taskId) {
  const [tasks, setTasks] = React.useState([]);
  const [changes, setChanges] = React.useState({ files: [], patch: '', loaded: false });
  const [error, setError] = React.useState(null);

  const loadTasks = React.useCallback(async () => {
    try { setTasks((await cliAgentsApi.tasks()).tasks || []); } catch { setTasks([]); }
  }, []);

  const loadChanges = React.useCallback(async () => {
    if (!taskId) { setChanges({ files: [], patch: '', loaded: false }); return; }
    setError(null);
    try { setChanges({ ...(await cliAgentsApi.changes(taskId)), loaded: true }); }
    catch (e) { setError(e.message || 'Could not read the changes.'); setChanges({ files: [], patch: '', loaded: true }); }
  }, [taskId]);

  React.useEffect(() => { loadTasks(); }, [loadTasks]);
  React.useEffect(() => { loadChanges(); }, [loadChanges]);

  const patches = React.useMemo(() => parsePatch(changes.patch || ''), [changes.patch]);
  return { tasks, changes, patches, error, refresh: () => { loadTasks(); loadChanges(); } };
}
