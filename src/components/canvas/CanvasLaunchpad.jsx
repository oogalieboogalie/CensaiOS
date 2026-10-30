/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../Icons.jsx';
import { BrandMark } from '../brand/BrandMark.jsx';
import { LAUNCHPAD_BOARDS, LAUNCHPAD_STARTS } from '../../lib/launchpadStarts.js';

// The starting buttons' names live in lib/launchpadStarts.js, where Add
// (Ctrl+K) reads them too.
export { LAUNCHPAD_BOARDS, LAUNCHPAD_STARTS };

// How the board moves with each "Canvas pan control" choice in Settings;
// the default takes Space + drag or a middle-click drag, and scrolling always moves it.
const PAN_HINTS = {
  middle: 'scroll or middle-click + drag — move around',
  alt: 'scroll or Alt + drag — move around',
};
export const panHint = (panMode) => PAN_HINTS[panMode] || 'scroll or Space + drag — move around';

/**
 * The welcome on an empty board (placed on the screen by EmptyState). Only
 * its buttons take clicks; the rest lets the board's own gestures through.
 */
export function CanvasLaunchpad({ manifests = [], onSpawn, onTour, suggestModules, chipKinds, panMode }) {
  const canSpawn = typeof onSpawn === 'function';
  const byKind = new Map((manifests || []).filter((m) => m?.launcher).map((m) => [m.kind, m]));
  const tiles = LAUNCHPAD_STARTS
    .filter((start) => byKind.has(start.kind) && (!chipKinds || chipKinds.includes(start.kind)))
    .map((start) => ({ ...byKind.get(start.kind), startLabel: start.label }));

  return (
    <div data-testid="canvas-launchpad" style={{ width: 560, maxWidth: '100%', pointerEvents: 'none', textAlign: 'center' }}>
      <BrandMark size={64} style={{ margin: '0 auto 20px' }} />
      <h1 style={{
        margin: 0, color: 'var(--ink)', fontFamily: 'var(--font-display)',
        fontSize: 'var(--text-2xl)', fontWeight: 600, lineHeight: 1.12, letterSpacing: '-0.022em',
      }}>Welcome to censaiOS.</h1>
      <p style={{
        margin: '8px 0 0', color: 'var(--ink-soft)', fontSize: 'var(--text-base)', lineHeight: 1.45,
      }}>Your infinite canvas for agents and ideas. Pick a place to start.</p>
      {typeof onTour === 'function' && (
        <div style={{ marginTop: 12 }}>
          <button type="button" onClick={onTour} style={{
            all: 'unset', pointerEvents: 'auto', cursor: 'pointer', display: 'inline-block',
            background: 'var(--accent)', color: 'var(--accent-contrast)',
            padding: '8px 18px', borderRadius: 'var(--radius-md)',
            fontWeight: 600, fontSize: 'var(--text-md)',
          }}>Show me around</button>
        </div>
      )}
      {tiles.length > 0 && (
        <div data-testid="launchpad-starts" style={{
          display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10,
          marginTop: 16,
        }}>
          {tiles.map((tile) => {
            const TileIcon = Icon[tile.launcher.icon] || Icon.Plus;
            return (
              <button
                key={tile.kind}
                type="button"
                disabled={!canSpawn}
                // Spec 6: "Browse modules" opens the one Add palette.
                onClick={() => (tile.kind === 'marketplace'
                  ? window.dispatchEvent(new CustomEvent('censai:open-add-palette'))
                  : canSpawn && onSpawn(tile.kind, tile.launcher.props || {}))}
                title={tile.launcher.hint || tile.startLabel}
                style={{
                  all: 'unset', pointerEvents: 'auto', boxSizing: 'border-box', cursor: canSpawn ? 'pointer' : 'default',
                  display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0,
                  whiteSpace: 'nowrap', padding: '7px 14px', borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--hairline)',
                  background: 'var(--surface)',
                  color: 'var(--ink)', fontSize: 'var(--text-md)', fontWeight: 500,
                }}
              >
                <span style={{ display: 'flex', flexShrink: 0, color: 'var(--ink-soft)' }}>
                  <TileIcon size={14} />
                </span>
                {tile.startLabel}
              </button>
            );
          })}
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
        <div data-testid="launchpad-tips" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', letterSpacing: '0.04em', lineHeight: 1.6, textAlign: 'left' }}>
          <div>{panHint(panMode)}</div>
          <div>Ctrl + scroll — zoom in &amp; out</div>
        </div>
      </div>
      <div style={{
        marginTop: 17, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-xs)', letterSpacing: '0.035em', lineHeight: 1.6,
      }}>
        Open a project from the menu at the top left
      </div>
      <div data-testid="launchpad-templates" style={{
        marginTop: 14, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 6,
        fontSize: 'var(--text-sm)',
      }}>
        <span style={{ color: 'var(--ink-faint)', flexBasis: '100%', marginBottom: 2 }}>Start from a ready-made board</span>
        {LAUNCHPAD_BOARDS.map((board) => (
          <button
            key={board.id}
            type="button"
            data-testid={`launchpad-board-${board.id}`}
            onClick={() => window.dispatchEvent(new CustomEvent('censai:open-templates', { detail: { id: board.id } }))}
            style={{
              all: 'unset', pointerEvents: 'auto', cursor: 'pointer', padding: '5px 12px', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--hairline)', color: 'var(--ink)', background: 'var(--surface)',
            }}
          >{board.label}</button>
        ))}
      </div>
    </div>
  );
}
