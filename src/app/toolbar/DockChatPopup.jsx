import React from 'react';
import { AgentAvatar } from '../../components/Agents.jsx';
import { useMessengerThreads } from './useMessengerThreads.js';

// Messenger popup anchored above the multi-tool dock: pick an agent from
// the family roster, then chat in a thread. Same threads + send pipe as the
// canvas chat windows, so conversations survive wherever they start.
export function DockChatPopup({ onClose }) {
  const { agents, active, activeId, setActiveId, threads, msgs, draft, setDraft, sending, error, send, scrollRef, setError } = useMessengerThreads();

  return (
    <div
      data-testid="dock-chat-popup"
      role="dialog"
      aria-label="Chat with an agent"
      style={{
        position: 'absolute', bottom: 'calc(100% + 10px)', left: '50%',
        transform: 'translateX(-50%)', zIndex: 60, width: 330,
        maxHeight: 'min(560px, 70vh)', display: 'flex', flexDirection: 'column',
        background: 'var(--surface)', border: '1px solid var(--hairline)',
        borderRadius: 14, boxShadow: 'var(--shadow-pop)', overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px 6px' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Family
        </span>
        <button
          type="button"
          onClick={onClose}
          title="Close chat"
          aria-label="Close chat"
          style={{ all: 'unset', cursor: 'pointer', fontSize: 12, color: 'var(--ink-faint)', padding: '2px 6px' }}
        >
          ✕
        </button>
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
              aria-label={`Chat with ${a.name}`}
              aria-pressed={isActive}
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
              aria-label={`Message ${active.name}`}
              style={{ all: 'unset', flex: 1, border: '1px solid var(--hairline)', borderRadius: 9, padding: '7px 10px', fontSize: 12, color: 'var(--ink)', background: 'var(--surface-2)' }}
            />
            <button
              onClick={send}
              disabled={sending || !draft.trim()}
              aria-label="Send message"
              style={{ all: 'unset', cursor: sending || !draft.trim() ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 700, color: 'white', background: 'var(--accent)', borderRadius: 9, padding: '7px 14px', opacity: sending || !draft.trim() ? 0.5 : 1 }}
            >
              ↑
            </button>
          </div>
        </>
      )}
    </div>
  );
}
