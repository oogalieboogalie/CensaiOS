import React from 'react';

export function OverseerLogs({ status, logEndRef }) {
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontFamily: 'var(--font-label)', fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', letterSpacing: 'var(--label-tracking)', textTransform: 'var(--label-case)', paddingLeft: 4 }}>Audit Logs</span>
      <div style={{ flex: 1, minHeight: 0, background: 'var(--surface-sunken)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-xl)', padding: 12, overflow: 'auto', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--ink)', lineHeight: 1.5 }}>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {status.logs || 'No logs available yet. Click Start Watcher or Run Now to begin.'}
        </pre>
        <div ref={logEndRef} />
      </div>
    </div>
  );
}
