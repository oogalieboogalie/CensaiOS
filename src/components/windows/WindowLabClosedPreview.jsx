import React from 'react';

export function WindowLabClosedPreview({ onReopen }) {
  return (
    <button
      type="button"
      onClick={onReopen}
      style={{
        all: 'unset', cursor: 'pointer', position: 'absolute', left: 24, top: 24,
        padding: '8px 12px', borderRadius: 'var(--radius-lg)',
        background: 'var(--surface)', border: '1px solid var(--hairline)',
        color: 'var(--ink-soft)', fontSize: 'var(--text-sm)', fontWeight: 700,
      }}
    >
      Reopen preview
    </button>
  );
}
