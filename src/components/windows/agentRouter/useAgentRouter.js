import React from 'react';
import { api } from '../../../lib/api.js';
import { useWorkspaceStore } from '../../../lib/store.js';
import { busAddress } from '../../../lib/agentRouter/routePlan.js';

// The Message Router window's state: the board's shared line, the last
// routed plan, and which parts were already sent to their agents.
export function useAgentRouter() {
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const [plan, setPlan] = React.useState(null);
  const [sent, setSent] = React.useState(() => new Set());
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  const route = async (text) => {
    if (!String(text || '').trim() || !workspaceId) return;
    setBusy(true);
    setError('');
    try {
      const result = await api.planRoute(workspaceId, text);
      setPlan(result.plan || null);
      setSent(new Set());
    } catch (err) {
      setError(err.message || 'The router could not read that.');
    } finally {
      setBusy(false);
    }
  };

  // Each routed part goes to its agent as a chat that starts at once.
  const send = (part) => {
    useWorkspaceStore.getState().spawnAt('chat', {
      agentId: part.agent.id,
      title: `${part.agent.name}: ${part.tags.slice(0, 3).join(' ')}`,
      msgs: [{ from: 'me', text: part.message }],
      autoSend: true,
    });
    setSent((prev) => new Set(prev).add(part.index));
  };

  const sendAll = () => (plan?.parts || []).filter((part) => !sent.has(part.index)).forEach(send);

  return { workspaceId, line: plan?.line || busAddress(workspaceId), plan, sent, busy, error, route, send, sendAll };
}
