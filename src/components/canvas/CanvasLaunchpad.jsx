/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../Icons.jsx';
import { MOODS, useTheme } from '../Theme.jsx';

export function CanvasLaunchpad({ manifests = [], onSpawn, onTour, suggestModules, chipKinds }) {
  const canSpawn = typeof onSpawn === 'function';
  const { theme } = useTheme();
  const darkStage = ((MOODS[theme.mood] || {}).mode || 'dark') === 'dark';
  const tiles = (manifests || [])
    .filter((m) => m?.launcher?.show && (!chipKinds || chipKinds.includes(m.kind)))
    .slice(0, 6);
  const [marqueePaused, setMarqueePaused] = React.useState(false);
  const [reducedMotion, setReducedMotion] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(media.matches);
    const listener = (e) => setReducedMotion(e.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);
  const loopTiles = reducedMotion ? tiles : [...tiles, ...tiles];

  return (
    <div data-testid="canvas-launchpad" style={{
      position: 'absolute', left: -280, top: -270, width: 560,
      maxWidth: 'calc(100vw - 40px)', pointerEvents: 'auto', textAlign: 'center',
    }}>
      <img src="/assets/trimmedblk.png" alt="CensaiOS" style={{
        display: 'block', width: 176, height: 'auto', margin: '0 auto',
        // The file is chrome-on-opaque-black: screen drops the black on dark
        // stages, invert + multiply drops the (inverted) white on light ones.
        mixBlendMode: darkStage ? 'screen' : 'multiply',
        filter: darkStage ? 'none' : 'invert(1)',
      }} />
      <h1 style={{
        margin: 0, color: 'var(--ink)', fontFamily: 'var(--font-display)',
        fontSize: 32, fontWeight: 650, lineHeight: 1.12, letterSpacing: '-0.025em',
      }}>Welcome to CensaiOS.</h1>
      <p style={{
        margin: '8px 0 0', color: 'var(--ink-soft)', fontSize: 14, lineHeight: 1.45,
      }}>Your infinite canvas for agents and ideas. Pop open a module below or take the tour.</p>
      {typeof onTour === 'function' && (
        <div style={{ marginTop: 12 }}>
          <button type="button" onClick={onTour} style={{
            all: 'unset', cursor: 'pointer', display: 'inline-block',
            background: 'var(--accent)', color: 'white',
            padding: '9px 20px', borderRadius: 999,
            fontWeight: 700, fontSize: 13,
            boxShadow: '0 2px 8px oklch(var(--accent-l) calc(var(--accent-c) * 0.8) var(--accent-h) / 0.35)',
          }}>Show me around →</button>
        </div>
      )}
      {tiles.length > 0 && (
        <div
          style={{
            overflow: 'hidden', marginTop: 6, padding: '10px 0',
            maskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)',
            WebkitMaskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)',
          }}
          onMouseEnter={() => setMarqueePaused(true)}
          onMouseLeave={() => setMarqueePaused(false)}
        >
          <style>{'@keyframes launchpad-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }'}</style>
          <div style={{
            display: 'flex', gap: 10, width: 'max-content',
            justifyContent: reducedMotion ? 'center' : 'flex-start',
            flexWrap: reducedMotion ? 'wrap' : 'nowrap',
            animation: reducedMotion ? 'none' : 'launchpad-marquee 24s linear infinite',
            animationPlayState: marqueePaused ? 'paused' : 'running',
          }}>
          {loopTiles.map((tile, index) => {
            const TileIcon = Icon[tile.launcher.icon] || Icon.Plus;
            return (
              <button
                key={`${tile.kind}-${index}`}
                type="button"
                disabled={!canSpawn}
                onClick={() => canSpawn && onSpawn(tile.kind, tile.launcher.props || {})}
                title={tile.launcher.hint || tile.launcher.label}
                style={{
                  all: 'unset', cursor: canSpawn ? 'pointer' : 'default',
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '8px 18px', borderRadius: 14,
                  border: '1px solid #d4d4d4',
                  background: 'linear-gradient(to bottom, #ffffff 0%, #f0f0f0 55%, #e2e2e2 100%)',
                  color: '#2b2b2b', fontSize: 12, fontWeight: 700,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.9), inset 0 -1px 0 rgba(0, 0, 0, 0.08), 0 3px 8px rgba(0, 0, 0, 0.18)',
                }}
              >
                <span style={{ display: 'flex', flexShrink: 0, color: '#2b2b2b' }}>
                  <TileIcon size={14} />
                </span>
                {tile.launcher.label || tile.label || tile.kind}
              </button>
            );
          })}
          </div>
        </div>
      )}
      <div style={{
        marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        color: 'var(--ink-faint)',
      }}>
        <svg width="30" height="30" viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="10.5" y="3" width="9" height="15" rx="4.5" />
          <line x1="15" y1="6.5" x2="15" y2="9.5" />
          <path d="M3.5 12.5h3M23.5 12.5h3" />
          <path d="M4.5 10.5 3.5 12.5l1 2M25.5 10.5l1 2-1 2" />
          <path d="M6 24.5c2 1.6 4.5 2.4 9 2.4s7-.8 9-2.4" strokeDasharray="2.5 2.5" />
        </svg>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.04em', lineHeight: 1.6, textAlign: 'left' }}>
          <div>click + drag — move through space</div>
          <div>ctrl + scroll — zoom in &amp; out</div>
        </div>
      </div>
      <div style={{
        marginTop: 17, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)',
        fontSize: 10, letterSpacing: '0.035em', lineHeight: 1.6,
      }}>
        Open a project from the top bar · drag to pan · Ctrl+scroll to zoom
      </div>
    </div>
  );
}
