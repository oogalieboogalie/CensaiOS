import React from 'react';

const ACTIVE = new Set(['pending', 'queued', 'working']);
const FAST_MS = 3000;
const SLOW_MS = 15000;

// Loads outgoing + incoming help requests and keeps polling: quickly while
// any request is still moving, slowly otherwise.
export function useHelpRequests(client, enabled) {
  const [state, setState] = React.useState({ outgoing: [], incoming: [], ready: false, error: '' });
  const [busyIds, setBusyIds] = React.useState(() => new Set());
  const timerRef = React.useRef(null);
  const mountedRef = React.useRef(true);

  const refresh = React.useCallback(async () => {
    if (!enabled) return;
    try {
      const result = await client.listHelpRequests();
      if (!mountedRef.current) return;
      setState({ outgoing: result?.outgoing || [], incoming: result?.incoming || [], ready: true, error: '' });
    } catch (error) {
      if (mountedRef.current) setState((prev) => ({ ...prev, ready: true, error: error.message || 'Help requests could not be loaded.' }));
    }
  }, [client, enabled]);

  const moving = [...state.outgoing, ...state.incoming].some((item) => ACTIVE.has(item.status));

  React.useEffect(() => {
    mountedRef.current = true;
    refresh();
    return () => { mountedRef.current = false; };
  }, [refresh]);

  React.useEffect(() => {
    if (!enabled) return undefined;
    timerRef.current = setInterval(refresh, moving ? FAST_MS : SLOW_MS);
    return () => clearInterval(timerRef.current);
  }, [enabled, moving, refresh]);

  const act = React.useCallback(async (id, fn) => {
    setBusyIds((prev) => new Set(prev).add(id));
    try {
      await fn();
      await refresh();
      return true;
    } catch (error) {
      setState((prev) => ({ ...prev, error: error.message || 'That did not work.' }));
      return false;
    } finally {
      setBusyIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    }
  }, [refresh]);

  return {
    ...state,
    busyIds,
    refresh,
    accept: (id) => act(id, () => client.decideHelpRequest(id, 'accept')),
    decline: (id) => act(id, () => client.decideHelpRequest(id, 'decline')),
    cancel: (id) => act(id, () => client.cancelHelpRequest(id)),
  };
}
