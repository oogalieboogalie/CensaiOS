import React from 'react';

export function useToolPackages(client, enabled) {
  const [state, setState] = React.useState({
    ready: false, packages: [], canManage: false, error: '', busyIds: new Set(),
  });
  const requestRef = React.useRef(0);

  const refresh = React.useCallback(async () => {
    const request = ++requestRef.current;
    if (!enabled) {
      setState({ ready: true, packages: [], canManage: false, error: '', busyIds: new Set() });
      return false;
    }
    setState(current => ({ ...current, ready: false, error: '' }));
    try {
      const result = await client.listToolPackages();
      if (request !== requestRef.current) return false;
      setState(current => ({ ...current, ready: true, packages: result.packages || [],
        canManage: Boolean(result.canManage), error: '' }));
      return true;
    } catch (error) {
      if (request !== requestRef.current) return false;
      setState(current => ({ ...current, ready: true, packages: [], canManage: false,
        error: error.message || 'Add-ons could not be loaded.' }));
      return false;
    }
  }, [client, enabled]);

  React.useEffect(() => {
    setState({ ready: false, packages: [], canManage: false, error: '', busyIds: new Set() });
    refresh();
    return () => { requestRef.current += 1; };
  }, [refresh]);

  const mutate = React.useCallback(async (packageId, action) => {
    setState(current => ({ ...current, error: '', busyIds: new Set(current.busyIds).add(packageId) }));
    try {
      await action(packageId);
      return refresh();
    } catch (error) {
      setState(current => ({ ...current, error: error.message || 'The add-on state was not saved.' }));
      return false;
    } finally {
      setState(current => {
        const busyIds = new Set(current.busyIds); busyIds.delete(packageId);
        return { ...current, busyIds };
      });
    }
  }, [refresh]);

  return {
    ...state, refresh,
    install: React.useCallback(id => mutate(id, client.installToolPackage), [client, mutate]),
    remove: React.useCallback(id => mutate(id, client.removeToolPackage), [client, mutate]),
  };
}
