/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../Icons.jsx';

export function CanvasStarterGrid({ starters, onSpawn }) {
  const canSpawn = typeof onSpawn === 'function';
  const spawn = (manifest) => {
    if (!canSpawn) return;
    const launcher = manifest.launcher;
    onSpawn(manifest.kind, launcher.props, undefined, launcher.sizeOverride);
  };

  return (
    <div aria-label="Workspace shortcuts" style={{
      display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 9,
    }}>
      {starters.map((manifest) => {
        const launcher = manifest.launcher;
        const Glyph = Icon[launcher.icon] || Icon.NewWindow;
        return (
          <button key={manifest.kind} type="button" disabled={!canSpawn}
            data-testid="canvas-starter" data-window-kind={manifest.kind}
            onClick={() => spawn(manifest)} style={{
              appearance: 'none', minWidth: 0, padding: '11px 12px', textAlign: 'left',
              border: '1px solid var(--hairline)', borderRadius: 10,
              background: 'var(--surface)', color: 'var(--ink)',
              boxShadow: 'var(--shadow-card)', cursor: canSpawn ? 'pointer' : 'default',
              opacity: canSpawn ? 1 : 0.6, display: 'grid', gridTemplateColumns: '28px 1fr',
              columnGap: 9, alignItems: 'center',
            }}>
            <span aria-hidden="true" style={{
              width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center',
              color: 'var(--ps-blue)',
              background: 'color-mix(in oklab, var(--ps-blue) 12%, var(--surface))',
            }}><Glyph size={14} /></span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700 }}>{launcher.label}</span>
              <span style={{
                display: 'block', marginTop: 2, color: 'var(--ink-soft)', fontSize: 11.5,
              }}>
                {launcher.hint}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
