import React from 'react';
import { WindowTitle } from '../WindowTitle.jsx';
import { windowMeta } from './meta.js';

// Re-export co-located metadata so the discovery layer can read component + meta
// from a single import.
export { windowMeta };

// A deliberately tiny reference window. It exists to prove the drop-in factory:
// this whole window is one self-contained folder (meta.js + index.jsx) and was
// registered without editing any central file by hand.
export function HelloFactoryWindow({ win = {}, onUpdate }) {
  const note = win.note || windowMeta.lab?.props?.note || 'Dropped in via the window factory.';
  return (
    <>
      <WindowTitle label={win.title || windowMeta.label} subtitle="factory demo" />
      <div style={{ flex: 1, minHeight: 0, padding: 20, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto' }}>
        <div style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--ink)' }}>It works.</div>
        <p style={{ fontSize: 'var(--text-sm)', lineHeight: 1.5, color: 'var(--ink-soft)', margin: 0 }}>{note}</p>
        <code style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)', background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-lg)', padding: '8px 10px' }}>
          kind: {windowMeta.kind} · {windowMeta.defaultSize.w}×{windowMeta.defaultSize.h}
        </code>
      </div>
    </>
  );
}
