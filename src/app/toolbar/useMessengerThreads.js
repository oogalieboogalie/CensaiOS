import React from 'react';
import { getAgents } from '../../lib/agentStore.js';
import { sendMessageWithMeta } from '../../lib/chat.js';
import { useWorkspaceStore } from '../../lib/store.js';

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
// every entry point sees the same conversations).
export function useMessengerThreads() {
  const workspaceId = useWorkspaceStore((s) => s.workspaceId);
  const currentProject = useWorkspaceStore((s) => s.currentProject);
  const [activeId, setActiveId] = React.useState(null);
  const [threads, setThreads] = React.useState(loadThreads);
  const [draft, setDraft] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState('');
  const scrollRef = React.useRef(null);

  const agents = React.useMemo(() => getAgents(), []);
  const active = agents.find((a) => a.id === activeId) || null;
  const msgs = activeId ? threads[activeId] || [] : [];

  React.useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
    } catch {}
  }, [threads]);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, activeId, sending]);

  const send = React.useCallback(async () => {
    if (!active || !draft.trim() || sending) return;
    const userMsg = { from: 'me', text: draft.trim(), ts: Date.now() };
    const history = [...msgs, userMsg];
    setThreads((t) => ({ ...t, [active.id]: history }));
    setDraft('');
    setError('');
    setSending(true);
    try {
      const reply = await sendMessageWithMeta(active.id, history, { workspaceId, currentProject });
      setThreads((t) => ({
        ...t,
        [active.id]: [...(t[active.id] || history), { from: active.id, text: reply.text || '(empty reply)', ts: Date.now() }],
      }));
    } catch (err) {
      setError(err?.message || 'Send failed. Try again shortly.');
    } finally {
      setSending(false);
    }
  }, [active, draft, sending, msgs, workspaceId, currentProject]);

  return { agents, active, activeId, setActiveId, threads, msgs, draft, setDraft, sending, error, send, scrollRef, setError };
}
