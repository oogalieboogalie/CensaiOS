import React from 'react';

export function WindowSuspenseFallback() {
  return (
    <div style={{
      flex: 1,
      display: 'grid',
      placeItems: 'center',
      minHeight: 0,
      padding: 20,
      color: 'var(--ink-faint)',
      background: 'var(--surface)',
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
    }}>
      loading window...
    </div>
  );
}
