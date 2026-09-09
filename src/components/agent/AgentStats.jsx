import React from 'react';

export function Stat({ label, value }) {
  return (
    <div style={{ padding: 8, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--hairline)' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-faint)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600, color: 'var(--ink)' }}>{value}</div>
    </div>
  );
}

export function JournalCard({ agent, count }) {
  return (
    <div title="Private to this agent. Not readable from this UI." style={{ padding: 8, borderRadius: 8, background: `oklch(0.95 0.03 ${agent.hue})`, border: `1px dashed oklch(0.7 0.10 ${agent.hue} / 0.6)`, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={`oklch(0.42 0.10 ${agent.hue})`} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: `oklch(0.42 0.10 ${agent.hue})`, letterSpacing: '0.08em', textTransform: 'uppercase' }}>journal · private</div>
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600, color: `oklch(0.32 0.10 ${agent.hue})` }}>{count} {count === 1 ? 'entry' : 'entries'}</div>
    </div>
  );
}

export function PillBtn({ children, ghost, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        all: 'unset', cursor: disabled ? 'default' : 'pointer',
        padding: '7px 12px', borderRadius: 999,
        background: ghost ? 'transparent' : 'var(--accent-soft)',
        color: ghost ? 'var(--ink-soft)' : 'var(--accent-ink)',
        boxShadow: ghost ? 'inset 0 0 0 1px var(--hairline)' : 'none',
        fontSize: 12, fontWeight: 600, opacity: disabled ? 0.5 : 1
      }}
    >
      {children}
    </button>
  );
}
