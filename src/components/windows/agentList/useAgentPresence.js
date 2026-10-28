import React from 'react';
import { useVisibilityAwareInterval } from '../../../lib/usePolling.js';
import { logFailure } from '../../../lib/appLog/browserLog.js';

/**
 * What the server knows about the board's agents (last chats, background
 * tasks, agents added from elsewhere), refreshed while the list is on
 * screen: every 5 s in front, every 15 s otherwise. Board windows sync on
 * their own, so this only fills in what is not on the board.
 */
export function useAgentPresence({ workspaceId, isActive, initial = null }) {
  const [data, setData] = React.useState(initial);
  const [error, setError] = React.useState('');
  const failedOnce = React.useRef(false);
  const ws = String(workspaceId || '').trim();

  const load = React.useCallback(async () => {
    if (!ws || initial) return;
    try {
      const res = await fetch(`/api/live-ops/workspaces/${encodeURIComponent(ws)}/agents`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      setData(body);
      setError('');
      failedOnce.current = false;
    } catch (err) {
      setError('Could not reach the server, so agents not on the board may look offline.');
      if (!failedOnce.current) logFailure('agent list: could not load presence', err, 'agent-list', 'warn');
      failedOnce.current = true;
    }
  }, [ws, initial]);

  React.useEffect(() => { load(); }, [load]);
  useVisibilityAwareInterval(() => { load(); }, isActive ? 5000 : 15000);
  return { data, error, hasWorkspace: Boolean(ws) };
}
