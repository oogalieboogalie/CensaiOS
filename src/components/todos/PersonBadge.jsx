/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';

// A round initial for a person on a to-do ("Me", or a teammate who took it).
export function PersonBadge({ name, size = 20 }) {
  const initial = String(name || '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <span
      aria-hidden="true"
      style={{
        width: size, height: size, borderRadius: 'var(--radius-full)', flexShrink: 0,
        display: 'grid', placeItems: 'center',
        background: 'var(--accent-soft)', color: 'var(--accent-ink)',
        fontSize: 'var(--text-xs)', fontWeight: 700,
      }}
    >
      {initial}
    </span>
  );
}
