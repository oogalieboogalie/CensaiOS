// Right-click menu for the code editor: Format Document, Format Selection,
// Ask Agent to Fix. Theme CSS variables only — no hardcoded palette.

import React from 'react';
import { useEscapeDismiss } from '../../lib/useEscapeDismiss.js';

function MenuButton({ label, hint, disabled, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        all: 'unset', display: 'flex', flexDirection: 'column', gap: 1, width: '100%',
        padding: '7px 10px', borderRadius: 6, cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1, boxSizing: 'border-box',
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = 'var(--accent-soft)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{label}</span>
      {hint && <span style={{ fontSize: 10, color: 'var(--ink-faint)' }}>{hint}</span>}
    </button>
  );
}

export function CodeEditorContextMenu({
  x, y, hasSelection, canFormat, formatHint,
  onFormatDocument, onFormatSelection, onAskAgent, onClose,
}) {
  const menuRef = React.useRef(null);
  useEscapeDismiss(true, onClose);

  React.useEffect(() => {
    const onPointerDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose?.();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [onClose]);

  const w = 250;
  const left = Math.max(4, Math.min(x, window.innerWidth - w - 8));
  const top = Math.max(4, Math.min(y, window.innerHeight - 190));

  const run = (fn) => (e) => { e.stopPropagation(); fn?.(); onClose?.(); };

  return (
    <div ref={menuRef} data-code-editor-menu
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: 'fixed', left, top, width: w, zIndex: 1000,
        background: 'var(--surface)', border: '1px solid var(--hairline)',
        borderRadius: 10, padding: 5, boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <MenuButton label="Format document" hint={formatHint || 'Prettier · whole file'}
        disabled={!canFormat} onClick={run(onFormatDocument)} />
      <MenuButton label="Format selection" hint={hasSelection ? 'Prettier · selected code' : 'Select code first'}
        disabled={!canFormat || !hasSelection} onClick={run(onFormatSelection)} />
      <div style={{ height: 1, background: 'var(--hairline)', margin: '4px 6px' }} />
      <MenuButton label="Ask agent to fix…" hint={hasSelection ? 'Sends selection to chat' : 'Select code first'}
        disabled={!hasSelection} onClick={run(onAskAgent)} />
    </div>
  );
}
