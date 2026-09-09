import React from 'react';
import { getAgents } from '../../lib/agentStore.js';
import { AgentAvatar } from '../Agents.jsx';
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

/**
 * Messenger-style sidebar: agent roster on the right rail, click an avatar
 * to open a floating thread. Sends through the same /api/chat pipe as canvas
 * chat windows, so no server changes were needed. Threads persist locally.
 */
export function AgentMessenger() {
  const workspaceId = useWorkspaceStore((s) => s.workspaceId);
  const currentProject = useWorkspaceStore((s) => s.currentProject);
  const [open, setOpen] = React.useState(false);
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

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Message the family"
        style={{
          all: 'unset', position: 'fixed', right: 16, bottom: 16, zIndex: 1300,
          width: 46, height: 46, borderRadius: '50%', background: 'var(--accent)',
          color: 'white', display: 'grid', placeItems: 'center', cursor: 'pointer',
          boxShadow: 'var(--shadow-pop)', fontSize: 20,
        }}
      >
        {open ? '✕' : '💬'}
      </button>

      {open && (
        <div style={{
          position: 'fixed', right: 16, bottom: 74, zIndex: 1300, width: 330,
          maxHeight: 'min(560px, 70vh)', display: 'flex', flexDirection: 'column',
          background: 'var(--surface)', border: '1px solid var(--hairline)',
          borderRadius: 14, boxShadow: 'var(--shadow-pop)', overflow: 'hidden',
        }}>
          <div style={{ padding: '10px 12px 6px', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Family
          </div>
          <div style={{ display: 'flex', gap: 8, padding: '0 12px 10px', overflowX: 'auto', borderBottom: '1px solid var(--hairline)' }}>
            {agents.map((a) => {
              const count = (threads[a.id] || []).length;
              const isActive = a.id === activeId;
              return (
                <button
                  key={a.id}
                  onClick={() => { setActiveId(a.id); setError(''); }}
                  title={a.name}
                  style={{
                    all: 'unset', cursor: 'pointer', position: 'relative', flexShrink: 0,
                    outline: isActive ? '2px solid var(--accent)' : 'none', outlineOffset: 2, borderRadius: '50%',
                  }}
                >
                  <AgentAvatar agent={a} size={34} />
                  {count > 0 && (
                    <span style={{ position: 'absolute', right: -4, bottom: -4, background: 'var(--accent)', color: 'white', fontSize: 9, fontWeight: 700, borderRadius: 999, padding: '0 5px', fontFamily: 'var(--font-mono)' }}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {!active ? (
            <div style={{ padding: 16, fontSize: 12, color: 'var(--ink-faint)', fontStyle: 'italic' }}>
              Pick an agent above to start chatting.
            </div>
          ) : (
            <>
              <div ref={scrollRef} style={{ flex: 1, minHeight: 180, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {msgs.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--ink-faint)', fontStyle: 'italic' }}>
                    Say hi to {active.name} — same brain as the canvas chat windows.
                  </div>
                )}
                {msgs.map((m, i) => (
                  <div key={i} style={{
                    alignSelf: m.from === 'me' ? 'flex-end' : 'flex-start',
                    maxWidth: '85%', fontSize: 12, padding: '6px 10px', borderRadius: 12,
                    background: m.from === 'me' ? 'var(--accent)' : 'var(--surface-2)',
                    color: m.from === 'me' ? 'white' : 'var(--ink)',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}>
                    {m.text}
                  </div>
                ))}
                {sending && <div style={{ fontSize: 11, color: 'var(--ink-faint)', fontStyle: 'italic' }}>{active.name} is thinking…</div>}
                {error && <div style={{ fontSize: 11, color: 'var(--ps-red)' }}>{error}</div>}
              </div>
              <div style={{ display: 'flex', gap: 6, padding: 10, borderTop: '1px solid var(--hairline)' }}>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder={`Message ${active.name}…`}
                  style={{ all: 'unset', flex: 1, border: '1px solid var(--hairline)', borderRadius: 9, padding: '7px 10px', fontSize: 12, color: 'var(--ink)', background: 'var(--surface-2)' }}
                />
                <button
                  onClick={send}
                  disabled={sending || !draft.trim()}
                  style={{ all: 'unset', cursor: sending || !draft.trim() ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 700, color: 'white', background: 'var(--accent)', borderRadius: 9, padding: '7px 14px', opacity: sending || !draft.trim() ? 0.5 : 1 }}
                >
                  ↑
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
