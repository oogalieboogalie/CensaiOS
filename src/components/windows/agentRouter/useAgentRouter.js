import React from 'react';
import { api } from '../../../lib/api.js';
import { useWorkspaceStore } from '../../../lib/store.js';
import { busAddress, sharedPlan } from '../../../lib/agentRouter/routePlan.js';
import { getCollaborationClientId } from '../../../lib/collaboration/clientIdentity.js';

const freshWin = (id) => useWorkspaceStore.getState().wins.find((w) => w.id === id);

// The Message Router window's state: the board's shared line, the last
// routed plan and which parts went out live on the window, so everyone on
// the board sees the same slips; the full plan (with this person's notes)
// stays in this browser only.
export function useAgentRouter(win = {}) {
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const [own, setOwn] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const board = win.routerPlan || null;
  const plan = own && board && own.stamp === board.stamp ? own.plan : board;
  const sent = React.useMemo(() => new Set(win.routerSent || []), [win.routerSent]);

  const save = (patch) => { if (win.id) useWorkspaceStore.getState().onUpdate(win.id, patch); };

  const route = async (text) => {
    if (!workspaceId) return;
    if (!String(text || '').trim()) { setError('Say what you need first, then press Route it.'); return; }
    setBusy(true);
    setError('');
    try {
      const result = await api.planRoute(workspaceId, text);
      const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      setOwn(result.plan ? { stamp, plan: result.plan } : null);
      save({ routerPlan: sharedPlan(result.plan, stamp), routerSent: [] });
    } catch (err) {
      setError(err.message || 'The router could not read that.');
    } finally {
      setBusy(false);
    }
  };

  // Each routed part goes to its agent as a chat that starts at once, and
  // only once: the board's copy is read fresh so a double press is a no-op.
  const send = (part) => {
    const already = (win.id ? freshWin(win.id)?.routerSent : null) || [];
    if (already.includes(part.index)) return;
    save({ routerSent: [...already, part.index] });
    useWorkspaceStore.getState().spawnAt('chat', {
      agentId: part.agent.id,
      title: `${part.agent.name}: ${part.tags.slice(0, 3).join(' ')}`,
      msgs: [{ from: 'me', text: part.message }],
      autoSend: true,
      // Only this browser asks the agent; teammates watching the chat do not ask again.
      autoSendBy: getCollaborationClientId(),
    });
  };

  const sendAll = () => (plan?.parts || []).forEach(send);

  return { workspaceId, line: plan?.line || busAddress(workspaceId), plan, sent, busy, error, route, send, sendAll };
}
