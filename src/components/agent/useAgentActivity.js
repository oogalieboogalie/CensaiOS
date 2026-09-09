import React from 'react';
import { api } from '../../lib/api.js';
import { useVisibilityAwareInterval } from '../../lib/usePolling.js';

export function useAgentActivity(agentId) {
  const [activity, setActivity] = React.useState({ wakeups: [], unread: 0 });

  const load = React.useCallback(() => {
    if (!agentId) return;
    api.getAgentActivity(agentId)
      .then(data => setActivity(data))
      .catch(() => {});
  }, [agentId]);

  React.useEffect(() => {
    load();
  }, [load]);

  useVisibilityAwareInterval(load, agentId ? 3000 : null);

  const active = activity.wakeups?.find(wake =>
    ['queued', 'in_progress', 'waiting_children'].includes(wake.status)
  );
  const latest = activity.wakeups?.[0];
  return {
    unread: activity.unread || 0,
    status: active?.status || (activity.unread ? 'notified' : latest?.status === 'failed' ? 'failed' : 'idle'),
    detail: active?.subject || active?.sender_name || latest?.error || '',
  };
}
