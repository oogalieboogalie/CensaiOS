import React from 'react';
import { cliAgentsApi } from './cliAgentsApi.js';
import { refreshCliRoster } from './useCliRoster.js';

const LIVE = new Set(['installing', 'starting', 'running', 'needs_approval']);

/**
 * Live view of one task: polls `since=<rev>` and merges changed items by id,
 * so a long transcript costs one small response per tick. Changes (git diff
 * in the worktree) refresh whenever an edit step finishes or the run ends.
 */
export function useCliTask(taskId) {
  const [task, setTask] = React.useState(null);
  const [items, setItems] = React.useState([]);
  const [permissions, setPermissions] = React.useState([]);
  const [changes, setChanges] = React.useState({ files: [], patch: '', loaded: false });
  const [error, setError] = React.useState(null);
  const revRef = React.useRef(0);
  const editRevRef = React.useRef(-1);

  const loadChanges = React.useCallback(async () => {
    if (!taskId) return;
    try {
      const data = await cliAgentsApi.changes(taskId);
      setChanges({ ...data, loaded: true });
    } catch { /* keep the last good diff */ }
  }, [taskId]);

  const poll = React.useCallback(async () => {
    if (!taskId) return null;
    try {
      const data = await cliAgentsApi.task(taskId, revRef.current);
      revRef.current = data.rev;
      setTask(data.task);
      setPermissions(data.permissions || []);
      if (data.items?.length) {
        setItems((prev) => {
          const byId = new Map(prev.map((i) => [i.id, i]));
          for (const item of data.items) byId.set(item.id, item);
          return [...byId.values()].sort((a, b) => (a.at - b.at) || 0);
        });
        const editDone = data.items.filter((i) => i.kind === 'edit' && i.status !== 'running').reduce((m, i) => Math.max(m, i.rev), -1);
        if (editDone > editRevRef.current) {
          editRevRef.current = editDone;
          loadChanges();
        }
      }
      setError(null);
      return data.task;
    } catch (err) {
      setError(err.status === 404 ? 'This task no longer exists.' : err.message);
      return null;
    }
  }, [taskId, loadChanges]);

  React.useEffect(() => {
    revRef.current = 0;
    editRevRef.current = -1;
    setItems([]);
    setTask(null);
    setChanges({ files: [], patch: '', loaded: false });
    if (!taskId) return undefined;
    let stopped = false;
    let timer = null;
    let wasLive = false;
    const tick = async () => {
      const t = await poll();
      if (stopped) return;
      const live = t && LIVE.has(t.status);
      if (wasLive && !live) { loadChanges(); refreshCliRoster(); }
      if (!wasLive && !t) loadChanges();
      wasLive = Boolean(live);
      const hidden = typeof document !== 'undefined' && document.hidden;
      timer = setTimeout(tick, live ? (hidden ? 3000 : 700) : 5000);
    };
    tick();
    loadChanges();
    return () => { stopped = true; clearTimeout(timer); };
  }, [taskId, poll, loadChanges]);

  return { task, items, permissions, changes, error, poll, loadChanges, live: Boolean(task && LIVE.has(task.status)) };
}
