/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';

export function ModuleStatusBar({ moduleTools, onRefresh }) {
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      background: 'var(--surface)', borderTop: '1px solid var(--hairline)',
      padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12,
      fontSize: 'var(--text-xs)', zIndex: 3,
    }}>
      <span style={{ fontWeight: 700, color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>
        Module tools added{moduleTools.length ? ` (${moduleTools.length})` : ''}:
      </span>
      <div data-testid="exo-module-tools" style={{ display: 'flex', flexWrap: 'nowrap', gap: 6, overflowX: 'auto', minWidth: 0, flex: 1 }}>
        {moduleTools.length === 0 ? (
          <span style={{ color: 'var(--ink-faint)', fontStyle: 'italic' }}>None · built-in tools remain active</span>
        ) : moduleTools.map(tool => (
          <span key={tool} style={{
            background: 'var(--surface-2)', border: '1px solid var(--hairline)',
            padding: '2px 8px', borderRadius: 'var(--radius-sm)', fontFamily: 'monospace',
            fontSize: 'var(--text-xs)', color: 'var(--accent-ink)', whiteSpace: 'nowrap', flexShrink: 0,
          }}>{tool}</span>
        ))}
      </div>
      <button type="button" onClick={onRefresh} data-testid="refresh-tool-packages"
        style={{ all: 'unset', cursor: 'pointer', color: 'var(--accent-ink)', fontWeight: 650, whiteSpace: 'nowrap' }}>
        Refresh add-ons
      </button>
    </div>
  );
}
