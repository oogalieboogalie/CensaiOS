import React from 'react';
import { WindowTitle } from './windows/WindowTitle.jsx';

export function RegistryTestWindow({ win, onUpdate }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <WindowTitle title="Registry Test Window" />
      <div style={{ flex: 1, padding: 16, overflowY: 'auto' }}>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--ink)' }}>Registry Test Window: Success!</p>
      </div>
    </div>
  );
}
