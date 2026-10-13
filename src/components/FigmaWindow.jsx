import React from 'react';
import { Icon } from './Icons.jsx';
import { WindowTitle } from './Windows.jsx';
import { FigmaEmbedView } from './figma/FigmaEmbedView.jsx';
import { FigmaConnect } from './figma/FigmaConnect.jsx';
import { FigmaImportPanel } from './figma/FigmaImportPanel.jsx';
import { useFigmaConnection } from './figma/useFigmaConnection.js';

const MODES = [
  { id: 'import', label: 'Import to canvas' },
  { id: 'embed', label: 'View only' },
];

// Figma: pull frames onto the canvas as live, borderless code that any model
// can keep editing (import), or keep Figma's own read-only viewer (embed).
export function FigmaWindow({ win, onUpdate }) {
  // Windows saved before import existed only had an embed URL.
  const mode = win.figmaMode || (win.url ? 'embed' : 'import');
  const connection = useFigmaConnection();

  return (
    <>
      <WindowTitle
        icon={<Icon.Edit size={14} />}
        label="Figma"
        subtitle={win.figmaTitle || (mode === 'import' ? 'Import designs' : 'Select File')}
      />
      <div role="tablist" aria-label="Figma mode" style={{ display: 'flex', gap: 4, padding: '8px 12px 0', background: 'var(--surface)' }}>
        {MODES.map(m => (
          <button
            key={m.id}
            role="tab"
            aria-selected={mode === m.id}
            onClick={() => onUpdate({ figmaMode: m.id })}
            style={{
              all: 'unset', cursor: 'pointer', padding: '6px 12px', borderRadius: 'var(--radius-full)', font: '500 12px var(--font-sans)',
              color: mode === m.id ? 'var(--accent-ink)' : 'var(--ink-soft)',
              background: mode === m.id ? 'var(--accent-soft)' : 'transparent',
            }}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--surface)' }}>
        {mode === 'embed' && <FigmaEmbedView win={win} onUpdate={onUpdate} />}
        {mode === 'import' && connection.loading && !connection.connected && (
          <div role="status" style={{ padding: 20, font: '13px var(--font-sans)', color: 'var(--ink-faint)' }}>Checking your Figma connection…</div>
        )}
        {mode === 'import' && !connection.loading && !connection.connected && <FigmaConnect connection={connection} />}
        {mode === 'import' && connection.connected && <FigmaImportPanel win={win} onUpdate={onUpdate} connection={connection} />}
      </div>
    </>
  );
}
