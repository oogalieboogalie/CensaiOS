import React from 'react';

export function ZoomHud({ zoom, onZoomIn, onZoomOut, onReset, onJumpNearestCluster }) {
  const pct = Math.round(zoom * 100);
  return (
    <div style={{
      position: 'fixed', bottom: 14, left: 14,
      display: 'flex', alignItems: 'center', gap: 2,
      background: 'var(--surface)', border: '1px solid var(--hairline)',
      borderRadius: 10, padding: 3,
      boxShadow: 'var(--shadow-card)',
      zIndex: 30,
      pointerEvents: 'auto',
    }}>
      <ZoomBtn onClick={onZoomOut} title="Zoom out">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </ZoomBtn>
      <ZoomBtn onClick={onJumpNearestCluster} title="Jump to nearest window cluster">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="8" r="2.5"/><circle cx="12" cy="17" r="2.5"/><path d="M9 8l5.5.5M8.5 9.2l2.2 5.6M15.6 10.2l-2.2 4.6"/>
        </svg>
      </ZoomBtn>
      <button onClick={onReset} title="Fit to content" style={{
        all: 'unset', cursor: 'pointer',
        fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em',
        color: 'var(--ink-soft)', padding: '4px 6px', borderRadius: 6,
        minWidth: 38, textAlign: 'center',
        transition: 'background 0.15s',
      }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >{pct}%</button>
      <ZoomBtn onClick={onZoomIn} title="Zoom in">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </ZoomBtn>
    </div>
  );
}

function ZoomBtn({ onClick, title, children }) {
  return (
    <button onClick={onClick} title={title} style={{
      all: 'unset', cursor: 'pointer',
      width: 26, height: 26, borderRadius: 7,
      display: 'grid', placeItems: 'center',
      color: 'var(--ink-soft)',
      transition: 'background 0.15s, color 0.15s',
    }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--ink)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ink-soft)'; }}
    >{children}</button>
  );
}

