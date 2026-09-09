import React from 'react';

export function useRegistryInstalls(client, enabled) {
  const [installed, setInstalled] = React.useState({});
  const [ready, setReady] = React.useState(false);
  const [canManage, setCanManage] = React.useState(false);
  const [error, setError] = React.useState('');
  const [busyIds, setBusyIds] = React.useState(() => new Set());
  const requestRef = React.useRef(0);
  const mountedRef = React.useRef(true);

  const refresh = React.useCallback(async () => {
    const request = ++requestRef.current;
    if (!enabled) {
      setInstalled({}); setCanManage(false); setReady(true); setError('');
      return false;
    }
    setReady(false); setError('');
    try {
      const result = await client.listInstalled();
      if (request !== requestRef.current) return false;
      setInstalled(result?.installed || {});
      setCanManage(Boolean(result?.canManage));
      setReady(true);
      return true;
    } catch (cause) {
      if (request !== requestRef.current) return false;
      setInstalled({}); setCanManage(false); setReady(true);
      setError(cause.message || 'Installed AgentCards could not be loaded.');
      return false;
    }
  }, [client, enabled]);

  React.useEffect(() => {
    mountedRef.current = true;
    setInstalled({}); setReady(false); setCanManage(false); setBusyIds(new Set());
    refresh();
    return () => { mountedRef.current = false; requestRef.current += 1; };
  }, [refresh]);

  const mutate = React.useCallback(async (cardId, action) => {
    setBusyIds(current => new Set(current).add(cardId));
    setError('');
    try {
      await action(cardId);
      return await refresh();
    } catch (cause) {
      if (mountedRef.current) setError(cause.message || 'The installed AgentCard state was not saved.');
      return false;
    } finally {
      if (mountedRef.current) {
        setBusyIds(current => {
          const next = new Set(current); next.delete(cardId); return next;
        });
      }
    }
  }, [refresh]);

  const install = React.useCallback(cardId => mutate(cardId, client.installCard), [client, mutate]);
  const uninstall = React.useCallback(cardId => mutate(cardId, client.uninstallCard), [client, mutate]);
  return { installed, ready, canManage, error, busyIds, refresh, install, uninstall };
}
