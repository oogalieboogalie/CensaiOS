/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';

export function ModuleStatusBar({ moduleTools, onRefresh }) {
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      background: 'var(--surface)', borderTop: '1px solid var(--hairline)',
      padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12,
      fontSize: 11, zIndex: 3,
    }}>
      <span style={{ fontWeight: 700, color: 'var(--ink-soft)' }}>Module tools added:</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 36, flex: 1 }}>
        {moduleTools.length === 0 ? (
          <span style={{ color: 'var(--ink-faint)', fontStyle: 'italic' }}>None · built-in tools remain active</span>
        ) : moduleTools.map(tool => (
          <span key={tool} style={{
            background: 'var(--surface-2)', border: '1px solid var(--hairline)',
            padding: '2px 8px', borderRadius: 4, fontFamily: 'monospace',
            fontSize: 10, color: 'var(--accent-ink)',
          }}>{tool}</span>
        ))}
      </div>
      <button type="button" onClick={onRefresh} data-testid="refresh-tool-packages"
        style={{ all: 'unset', cursor: 'pointer', color: 'var(--accent-ink)', fontWeight: 650 }}>
        Refresh add-ons
      </button>
    </div>
  );
}
