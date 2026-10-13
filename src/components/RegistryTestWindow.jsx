import React from 'react';
import { WindowTitle } from './windows/WindowTitle.jsx';

export function RegistryTestWindow({ win, onUpdate }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <WindowTitle label="Registry test window" />
      <div style={{ flex: 1, padding: 16, overflowY: 'auto' }}>
        <p style={{ margin: 0, fontSize: 'var(--text-base)', color: 'var(--ink)' }}>Registry Test Window: Success!</p>
      </div>
    </div>
  );
}
