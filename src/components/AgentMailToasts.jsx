import React from 'react';
import { api } from '../lib/api.js';
import { useVisibilityAwareInterval } from '../lib/usePolling.js';
import { describeMailEvent } from '../lib/agentMailFeed.js';

const POLL_MS = 4000;
const TOAST_TTL_MS = 8000;
const MAX_VISIBLE = 3;

/**
 * Top-center pill toasts confirming agent>agent mail flow:
 * "Atlas → Censai · message complete" for fresh sends,
 * "Censai → Atlas · reply complete" for thread replies.
 * Polls /api/mail-activity and only toasts arrivals newer than the
 * baseline watermark, so history never replays on load.
 */
export function AgentMailToasts({ workspaceId }) {
  const [toasts, setToasts] = React.useState([]);
  const watermarkRef = React.useRef(null);
  const seenRef = React.useRef(new Set());
  const baselineRef = React.useRef(false);

  const pushToast = React.useCallback((msg) => {
    const id = msg.id;
    if (seenRef.current.has(id)) return;
    seenRef.current.add(id);
    const described = { ...describeMailEvent(msg), id, createdAt: msg.created_at };
    setToasts((current) => [...current, described].slice(-MAX_VISIBLE));
    setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, TOAST_TTL_MS);
  }, []);

  const poll = React.useCallback(async () => {
    if (!workspaceId) return;
    try {
      const messages = await api.getMailActivity({
        workspaceId,
        since: watermarkRef.current,
      });
      if (!Array.isArray(messages) || messages.length === 0) return;
      const newest = messages[0]?.created_at || null;
      if (!baselineRef.current) {
        // First poll only sets the baseline — no replay of history.
        baselineRef.current = true;
        for (const msg of messages) seenRef.current.add(msg.id);
        if (newest) watermarkRef.current = newest;
        return;
      }
      // API returns newest-first; toast oldest-first for reading order.
      for (const msg of [...messages].reverse()) pushToast(msg);
      if (newest) watermarkRef.current = newest;
    } catch {
      // Feed failures stay silent — toasts must never break the canvas.
    }
  }, [workspaceId, pushToast]);

  React.useEffect(() => {
    baselineRef.current = false;
    watermarkRef.current = null;
    seenRef.current = new Set();
    setToasts([]);
    poll();
  }, [workspaceId, poll]);

  useVisibilityAwareInterval(poll, workspaceId ? POLL_MS : null);

  const dismiss = React.useCallback((id) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', top: 14, left: '50%', transform: 'translateX(-50%)',
      zIndex: 1300, display: 'flex', flexDirection: 'column', gap: 8,
      alignItems: 'center', pointerEvents: 'none',
    }}>
      {toasts.map((t) => (
        <div key={t.id} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--surface)', border: '1px solid var(--hairline)',
          borderRadius: 999, boxShadow: 'var(--shadow-pop)',
          padding: '8px 8px 8px 14px', fontFamily: 'var(--font-sans)', fontSize: 12,
          color: 'var(--ink)', pointerEvents: 'auto', maxWidth: 'min(560px, 90vw)',
          animation: 'agent-mail-toast-in 0.25s ease-out',
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
            background: t.isReply ? 'var(--accent)' : 'var(--ps-green)',
          }} />
          <span style={{ display: 'grid', gap: 1, minWidth: 0 }}>
            <strong style={{ whiteSpace: 'nowrap' }}>{t.title}</strong>
            {t.sub && (
              <span style={{
                color: 'var(--ink-faint)', fontSize: 11, overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 420,
              }}>
                {t.sub}
              </span>
            )}
          </span>
          <button
            onClick={() => dismiss(t.id)}
            title="Dismiss"
            style={{ all: 'unset', cursor: 'pointer', color: 'var(--ink-faint)', fontSize: 12, padding: '0 4px' }}
          >
            ✕
          </button>
          <style>{'@keyframes agent-mail-toast-in { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }'}</style>
        </div>
      ))}
    </div>
  );
}
