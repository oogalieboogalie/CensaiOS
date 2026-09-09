import React from 'react';

export function OverseerLogs({ status, logEndRef }) {
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', paddingLeft: 4 }}>Audit Logs</span>
      <div style={{ flex: 1, minHeight: 0, background: '#0e1117', border: '1px solid #21262d', borderRadius: 12, padding: 12, overflow: 'auto', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-mono)', fontSize: 11, color: '#c9d1d9', lineHeight: 1.5 }}>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {status.logs || 'No logs available yet. Click Start Watcher or Run Now to begin.'}
        </pre>
        <div ref={logEndRef} />
      </div>
    </div>
  );
}
