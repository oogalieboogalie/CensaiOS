import React from 'react';

function formatCountdown(totalSeconds) {
  if (totalSeconds <= 0) return '00:00';
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function OverseerStatus({ status }) {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyItems: 'center', alignItems: 'center', background: 'var(--surface-2)', padding: '12px 10px', borderRadius: 12, border: '1px solid var(--hairline)', textAlign: 'center' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, color: 'var(--ink-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Audit Status</span>
        {status.isAuditing ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--ps-blue)' }}>
            <span className="spinner" style={{ width: 10, height: 10, borderRadius: '50%', border: '2px solid var(--ps-blue)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
            Running Audit
          </span>
        ) : status.isRunning ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--ps-green)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ps-green)', boxShadow: '0 0 8px var(--ps-green)' }} />
            Watching
          </span>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--ink-soft)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ink-faint)' }} />
            Stopped
          </span>
        )}
      </div>

      <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', justifyItems: 'center', alignItems: 'center', background: 'var(--surface-2)', padding: '12px 10px', borderRadius: 12, border: '1px solid var(--hairline)', textAlign: 'center' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, color: 'var(--ink-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Next Audit In</span>
        {status.isRunning ? (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>
            {formatCountdown(status.countdown)}
          </span>
        ) : (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: 'var(--ink-faint)', padding: '2px 0' }}>
            Watcher Off
          </span>
        )}
      </div>
    </div>
  );
}
