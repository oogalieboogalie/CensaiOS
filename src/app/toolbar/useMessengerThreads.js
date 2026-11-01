import React from 'react';
import { getAgents } from '../../lib/agentStore.js';
import { sendMessageWithMeta } from '../../lib/chat.js';
import { useWorkspaceStore } from '../../lib/store.js';
import { needsKey } from '../../lib/chat/keyNeeded.js';
import { handoffsFromTools } from '../../lib/censai/handoffs.js';
import { useFamilyReplyThreads } from './useFamilyReplyThreads.js';

const STORAGE_KEY = 'homebase.messenger.v1';

function loadThreads() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

// Shared thread state for messenger-style agent chats (same /api/chat pipe
// as canvas chat windows, threads persist in localStorage under one key so
// every entry point sees the same conversations). `initialId` opens one
// agent's thread straight away (the pinned chat opens on Censai); onReply
// hears which agent just answered.
export function useMessengerThreads({ initialId = null, onReply = null } = {}) {
  const workspaceId = useWorkspaceStore((s) => s.workspaceId);
  const currentProject = useWorkspaceStore((s) => s.currentProject);
  const [activeId, setActiveId] = React.useState(initialId);
  const [threads, setThreads] = React.useState(loadThreads);
  const [draft, setDraft] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState('');
  // No key for the agent's model: { agentId, keyProvider, message } for the card.
  const [keyNeeded, setKeyNeeded] = React.useState(null);
  const scrollRef = React.useRef(null);
  const onReplyRef = React.useRef(onReply);
  onReplyRef.current = onReply;

  const agents = React.useMemo(() => getAgents(), []);
  const active = agents.find((a) => a.id === activeId) || null;
  const msgs = activeId ? threads[activeId] || [] : [];

  // A family reply lands in that agent's thread even when another chat is open.
  useFamilyReplyThreads({
    agentIds: agents.map((agent) => agent.id),
    workspaceId,
    threads,
    onReply: (id, notice) => setThreads((t) => {
      const thread = t[id] || [];
      if (thread.some((message) => message.familyReplyWakeId === notice.familyReplyWakeId)) return t;
      return { ...t, [id]: [...thread, notice] };
    }),
  });

  React.useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
    } catch {}
  }, [threads]);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, activeId, sending]);

  const deliver = React.useCallback(async (agent, history) => {
    setError('');
    setKeyNeeded(null);
    setSending(true);
    try {
      const reply = await sendMessageWithMeta(agent.id, history, { workspaceId, currentProject });
      const handoffs = handoffsFromTools(reply.tools);
      const answer = { from: agent.id, text: reply.text || '(empty reply)', ts: Date.now(), ...(handoffs.length ? { handoffs } : {}) };
      setThreads((t) => ({ ...t, [agent.id]: [...(t[agent.id] || history), answer] }));
      onReplyRef.current?.(agent.id, reply);
    } catch (err) {
      if (needsKey(err)) {
        setKeyNeeded({ agentId: agent.id, keyProvider: err.details?.keyProvider || null, message: err.message });
      } else {
        setError(err?.message || 'Send failed. Try again shortly.');
      }
    } finally {
      setSending(false);
    }
  }, [workspaceId, currentProject]);

  const send = React.useCallback(async () => {
    if (!active || !draft.trim() || sending) return;
    const userMsg = { from: 'me', text: draft.trim(), ts: Date.now() };
    const history = [...msgs, userMsg];
    setThreads((t) => ({ ...t, [active.id]: history }));
    setDraft('');
    await deliver(active, history);
  }, [active, draft, sending, msgs, deliver]);

  // After a key is pasted: send the thread's last message again.
  const resend = React.useCallback(() => {
    if (active && !sending && msgs.length > 0) deliver(active, msgs);
  }, [active, sending, msgs, deliver]);

  // A line that did not come from a send, such as a plan's checked result.
  const appendMessage = React.useCallback((agentId, message) => {
    setThreads((t) => ({ ...t, [agentId]: [...(t[agentId] || []), message] }));
  }, []);

  const keyCard = keyNeeded && keyNeeded.agentId === activeId ? keyNeeded : null;

  return { agents, active, activeId, setActiveId, threads, msgs, draft, setDraft, sending, error, send, resend, keyCard, scrollRef, setError, appendMessage };
}
