import React from 'react';
import { figmaApi } from './figmaApi.js';

export function useFigmaConnection() {
  const [state, setState] = React.useState({ loading: true, connected: false, source: null, user: null, invalid: false, error: '' });

  const refresh = React.useCallback(async () => {
    try {
      const data = await figmaApi.status();
      setState({ loading: false, connected: Boolean(data.connected), source: data.source || null, user: data.user || null, invalid: Boolean(data.invalid), error: '' });
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: err.message }));
    }
  }, []);

  React.useEffect(() => { refresh(); }, [refresh]);

  const connect = React.useCallback(async (token) => {
    setState(s => ({ ...s, loading: true, error: '' }));
    try {
      await figmaApi.connect(token);
      await refresh();
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: err.message }));
    }
  }, [refresh]);

  const disconnect = React.useCallback(async () => {
    try { await figmaApi.disconnect(); } finally { await refresh(); }
  }, [refresh]);

  return { ...state, connect, disconnect, refresh };
}
