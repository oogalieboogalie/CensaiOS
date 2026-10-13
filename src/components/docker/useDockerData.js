import { useCallback, useEffect, useRef, useState } from 'react';
import { useVisibilityAwareInterval } from '../../lib/usePolling.js';
import { dockerApi, friendlyError } from './dockerApi.js';

const HISTORY = 60; // 60 samples x 3s = the last three minutes
const STATS_TABS = new Set(['containers', 'compose']);
const RESOURCE_LOADERS = {
  compose: dockerApi.compose,
  images: dockerApi.images,
  volumes: dockerApi.volumes,
  networks: dockerApi.networks,
};

/**
 * All Docker window state in one place: engine status, containers, a rolling
 * per-container CPU/memory history and whichever resource list the active
 * tab shows. Polls only what is on screen and stops when the tab is hidden.
 */
export function useDockerData(tab) {
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState(null);
  const [containers, setContainers] = useState(null);
  const [stats, setStats] = useState({});
  const [history, setHistory] = useState({});
  const [resources, setResources] = useState({});
  const [resourceErrors, setResourceErrors] = useState({});
  const [busy, setBusy] = useState({});
  const [toast, setToast] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [stale, setStale] = useState(false);
  const toastTimer = useRef(null);
  const statsInFlight = useRef(false);
  const available = status?.available === true;

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await dockerApi.status());
      setStatusError(null);
    } catch (err) {
      setStatusError(err);
    }
  }, []);

  const loadContainers = useCallback(async () => {
    try {
      setContainers(await dockerApi.containers());
      setUpdatedAt(Date.now());
      setStale(false);
    } catch (err) {
      setStale(true);
      if (err.reason) setStatus({ available: false, reason: err.reason, message: err.message });
      else setStatusError(err);
    }
  }, []);

  const loadStats = useCallback(async () => {
    // `docker stats --no-stream` can take ~2s on a busy engine; never stack calls.
    if (statsInFlight.current) return;
    statsInFlight.current = true;
    try {
      const rows = await dockerApi.stats();
      const byId = Object.fromEntries(rows.map((s) => [s.id, s]));
      const t = Date.now();
      setStats(byId);
      setHistory((prev) => {
        const next = {};
        for (const s of rows) {
          next[s.id] = [...(prev[s.id] || []), {
            t, cpu: s.cpu, mem: s.memPercent, memUsed: s.memUsed,
            netRx: s.netRx, netTx: s.netTx, blockRead: s.blockRead, blockWrite: s.blockWrite,
          }].slice(-HISTORY);
        }
        return next;
      });
    } catch { /* stats are a nice-to-have; the list still renders */ } finally {
      statsInFlight.current = false;
    }
  }, []);

  const loadResource = useCallback(async (name) => {
    const loader = RESOURCE_LOADERS[name];
    if (!loader) return;
    try {
      const rows = await loader();
      setResources((prev) => ({ ...prev, [name]: rows }));
      setResourceErrors((prev) => ({ ...prev, [name]: null }));
    } catch (err) {
      setResourceErrors((prev) => ({ ...prev, [name]: err.message }));
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);
  useEffect(() => { if (available) loadContainers(); }, [available, loadContainers]);
  useEffect(() => { if (available) loadResource(tab); }, [available, tab, loadResource]);
  const hasRunning = (containers || []).some((c) => c.state === 'running');
  const wantStats = available && hasRunning && STATS_TABS.has(tab);
  useEffect(() => { if (wantStats) loadStats(); }, [wantStats, loadStats]);

  useVisibilityAwareInterval(loadStatus, available ? 15_000 : 5_000);
  useVisibilityAwareInterval(loadContainers, available ? 3_000 : null);
  useVisibilityAwareInterval(loadStats, wantStats ? 3_000 : null);
  useVisibilityAwareInterval(() => loadResource(tab), available && RESOURCE_LOADERS[tab] ? 12_000 : null);

  const notify = useCallback((message, tone = 'ok') => {
    clearTimeout(toastTimer.current);
    setToast({ message, tone, at: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), tone === 'danger' ? 7_000 : 3_500);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const refresh = useCallback(async () => {
    await loadStatus();
    await Promise.all([loadContainers(), loadResource(tab), STATS_TABS.has(tab) ? loadStats() : null]);
  }, [loadStatus, loadContainers, loadResource, loadStats, tab]);

  /** Run a mutation with a busy flag, a toast, and a refresh afterwards. */
  const run = useCallback(async (key, fn, success) => {
    setBusy((prev) => ({ ...prev, [key]: true }));
    try {
      const result = await fn();
      if (success) notify(typeof success === 'function' ? success(result) : success);
      await refresh();
      return result;
    } catch (err) {
      notify(friendlyError(err.message), 'danger');
      return null;
    } finally {
      setBusy((prev) => ({ ...prev, [key]: false }));
    }
  }, [notify, refresh]);

  return {
    status, statusError, available, containers, stats, history,
    resources, resourceErrors, busy, toast, run, refresh, notify, updatedAt, stale,
    dismissToast: () => setToast(null),
  };
}
