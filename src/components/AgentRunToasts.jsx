import React from 'react';

/**
 * Sidebar toasts for finished headless agent runs. Reads the latest
 * `opencode.completed` workspace event from collaboration state, shows the
 * output tail, and offers one click back to the full transcript window.
 */
export function AgentRunToasts({ collaboration, onOpenWindow }) {
  const [dismissedAt, setDismissedAt] = React.useState(0);
  const run = collaboration?.lastAgentRun || null;
  const visible = run && run.receivedAt > dismissedAt;
  if (!visible) return null;

  const ok = Number(run.exitCode || 0) === 0;
  const tailLines = String(run.tail || '').split('\n').filter(Boolean).slice(-6);

  return (
    <div style={{
      position: 'fixed', right: 16, bottom: 64, zIndex: 1200, width: 340,
      background: 'var(--surface)', border: '1px solid var(--hairline)',
      borderRadius: 12, boxShadow: 'var(--shadow-pop)', padding: 12,
      fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: ok ? 'var(--ps-green)' : 'var(--ps-red)',
        }} />
        <strong style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Agent {ok ? 'finished' : `exited (${run.exitCode})`}
        </strong>
        <button
          onClick={() => setDismissedAt(Date.now())}
          title="Dismiss"
          style={{ all: 'unset', cursor: 'pointer', color: 'var(--ink-faint)', fontSize: 13 }}
        >
          ✕
        </button>
      </div>
      <div style={{ color: 'var(--ink-soft)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {run.prompt || 'Headless run'}
      </div>
      {tailLines.length > 0 && (
        <pre style={{
          margin: '0 0 8px', padding: 8, borderRadius: 8, background: 'var(--surface-2)',
          font: '10px var(--font-mono)', color: 'var(--ink-soft)',
          maxHeight: 120, overflow: 'hidden', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {tailLines.join('\n')}
        </pre>
      )}
      {run.windowId && (
        <button
          onClick={() => { onOpenWindow?.(run.windowId); setDismissedAt(Date.now()); }}
          style={{ all: 'unset', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'var(--accent-ink)', padding: '5px 10px', borderRadius: 7, background: 'var(--accent-soft)' }}
        >
          Open transcript
        </button>
      )}
    </div>
  );
}
