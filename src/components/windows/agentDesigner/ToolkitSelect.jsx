import React from 'react';
import { TOOLKITS, toolkitTools } from './toolkits.js';
import { darkInputStyle } from './styles.js';

export function ToolkitSelect({ onApply }) {
  const [toolkitId, setToolkitId] = React.useState('default');
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink)' }}>Select Toolkit</span>
      <span style={{ display: 'flex', gap: 6 }}>
        <select
          aria-label="Select Toolkit"
          value={toolkitId}
          onChange={e => setToolkitId(e.target.value)}
          style={{ ...darkInputStyle, flex: 1, minWidth: 0 }}
        >
          {TOOLKITS.map(toolkit => (
            <option key={toolkit.id} value={toolkit.id} title={toolkit.description}>
              {toolkit.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onApply?.(toolkitTools(toolkitId), toolkitId)}
          style={{ ...darkInputStyle, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          Apply
        </button>
      </span>
    </label>
  );
}
