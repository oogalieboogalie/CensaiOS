import React from 'react';
import { api } from '../../lib/api.js';
import { useWorkspaceStore } from '../../lib/store.js';
import { normalizeTodos } from './TodosData.js';
import { useVisibilityAwareInterval } from '../../lib/usePolling.js';

const POLL_INTERVAL_MS = 10_000;
const IN_FLIGHT_STATUSES = new Set(['queued', 'dispatched', 'pr_open', 'blocked']);

function hasInflightItems(items) {
  return items.some(it => IN_FLIGHT_STATUSES.has(it.implementationStatus));
}

export function useOperationalTodos(win, onUpdate, localItems) {
  const workspaceId = useWorkspaceStore(state => state.workspaceId);
  const [enabled, setEnabled] = React.useState(Boolean(win.artifactId));
  const [error, setError] = React.useState('');
  const openedRef = React.useRef(null);
  const itemsRef = React.useRef(localItems);
  itemsRef.current = localItems;

  // --- Initial open / resolve ---
  React.useEffect(() => {
    if (!workspaceId || !win?.id) return;
    const openKey = `${workspaceId}:${win.id}:${win.artifactId || 'new'}`;
    if (openedRef.current === openKey) return;
    openedRef.current = openKey;

    let cancelled = false;
    api.openOperationalTodoList({
      workspaceId,
      windowId: win.id,
      artifactId: win.artifactId || null,
      title: win.title || 'To-do List',
      items: localItems,
    }).then(result => {
      if (cancelled) return;
      if (!result) {
        setEnabled(false);
        return;
      }
      setEnabled(true);
      setError('');
      onUpdate({
        artifactId: result.artifactId,
        operationalIntelligence: true,
        items: normalizeTodos(result.items),
      });
    }).catch(err => {
      if (!cancelled) {
        setEnabled(false);
        setError(err.message || 'Operational save unavailable');
      }
    });

    return () => { cancelled = true; };
  }, [workspaceId, win?.id, win?.artifactId]);

  // --- Lightweight refresh (read-only GET) ---
  const refresh = React.useCallback(async () => {
    if (!enabled || !win.artifactId) return;
    try {
      const result = await api.refreshOperationalTodoList({ workspaceId, listArtifactId: win.artifactId });
      if (!result) return;
      setError('');
      onUpdate({
        artifactId: result.artifactId,
        operationalIntelligence: true,
        items: normalizeTodos(result.items),
      });
    } catch {
      // Silently ignore polling errors — don't flash errors on transient failures
    }
  }, [enabled, workspaceId, win.artifactId, onUpdate]);

  // --- Poll every 10s when items are in-flight ---
  const shouldPoll = enabled && Boolean(win.artifactId) && hasInflightItems(localItems);
  useVisibilityAwareInterval(refresh, shouldPoll ? POLL_INTERVAL_MS : null);

  // --- Immediate refresh on tasks-updated event ---
  React.useEffect(() => {
    if (!enabled || !win.artifactId) return;
    const handler = () => refresh();
    window.addEventListener('tasks-updated', handler);
    return () => window.removeEventListener('tasks-updated', handler);
  }, [enabled, win.artifactId, refresh]);

  const run = React.useCallback(async (fallbackItems, request) => {
    if (!enabled || !workspaceId || !win.artifactId) {
      onUpdate({ items: normalizeTodos(fallbackItems) });
      return null;
    }
    onUpdate({ items: normalizeTodos(fallbackItems) });
    try {
      const result = await request();
      if (!result) {
        setEnabled(false);
        return null;
      }
      setError('');
      onUpdate({ artifactId: result.artifactId, operationalIntelligence: true, items: normalizeTodos(result.items) });
      return result;
    } catch (err) {
      setError(err.message || 'Operational save unavailable');
      return null;
    }
  }, [enabled, workspaceId, win.artifactId, onUpdate]);

  const addItem = React.useCallback((nextItems, item) => run(nextItems, () => (
    api.createOperationalTodo({
      workspaceId,
      listArtifactId: win.artifactId,
      item,
      order: nextItems.length - 1,
    })
  )), [run, workspaceId, win.artifactId]);

  const updateItem = React.useCallback((nextItems, itemId, patch) => run(nextItems, () => (
    api.updateOperationalTodo({
      workspaceId,
      listArtifactId: win.artifactId,
      itemArtifactId: itemId,
      patch,
    })
  )), [run, workspaceId, win.artifactId]);

  const dispatchItem = React.useCallback((nextItems, itemId) => run(nextItems, () => (
    api.dispatchOperationalTodo({
      workspaceId,
      listArtifactId: win.artifactId,
      itemArtifactId: itemId,
    })
  )), [run, workspaceId, win.artifactId]);

  return { enabled, error, addItem, updateItem, dispatchItem, refresh };
}
