/**
 * src/components/dock/DockVisibilityToggle.jsx
 *
 * Brief B3 — `.team/handoffs/2026-06-23-b3-sidebar-visibility.md`.
 *
 * Popover anchored to the dock header. Three sections:
 *   - Show dock (master toggle)
 *   - Show group (per-group toggle)
 *   - Show agent (per-agent toggle within the active group)
 *
 * Each row is a switch that calls into useDockVisibility setters. The
 * popover is dismissed by clicking outside (handled by an outside-click
 * effect).
 */

import React from 'react';
import { isAgentVisible, isGroupVisible, useDockVisibility } from './useDockVisibility.js';

function Switch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      style={{
        all: 'unset',
        cursor: 'pointer',
        padding: '4px 12px',
        borderRadius: 999,
        background: checked ? 'var(--accent, #6c8cff)' : 'var(--surface)',
        color: checked ? 'var(--accent-ink, white)' : 'var(--ink-soft)',
        border: '1px solid var(--hairline)',
        minWidth: 48,
        textAlign: 'center',
        fontSize: 11,
      }}
    >
      {checked ? 'On' : 'Off'}
    </button>
  );
}

export function DockVisibilityToggle({ groups = [], anchorRef, onClose }) {
  const ref = React.useRef(null);
  const { dock, visible, setVisible, setGroupVisible, setAgentVisible } = useDockVisibility();
  const [activeGroupId, setActiveGroupId] = React.useState(groups[0]?.id || null);

  // Outside-click dismiss.
  React.useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target) && !anchorRef?.current?.contains(e.target)) {
        onClose && onClose();
      }
    };
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchorRef, onClose]);

  return (
    <div
      ref={ref}
      data-testid="dock-visibility-toggle"
      style={{
        position: 'absolute',
        right: 0,
        top: 40,
        zIndex: 40,
        width: 240,
        background: 'var(--surface)',
        color: 'var(--ink)',
        border: '1px solid var(--hairline)',
        borderRadius: 12,
        boxShadow: 'var(--shadow-card)',
        padding: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Dock visibility</span>
        <Switch checked={visible} onChange={setVisible} label="Show dock" />
      </div>
      <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 10, marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Show group
        </div>
        {groups.map((g) => {
          const groupVisible = isGroupVisible(dock, g.id, g.agentIds);
          return (
            <div
              key={g.id}
              data-testid={`dock-group-${g.id}`}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}
            >
              <button
                type="button"
                onClick={() => setActiveGroupId(g.id)}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  fontSize: 12,
                  color: activeGroupId === g.id ? 'var(--ink)' : 'var(--ink-soft)',
                  fontWeight: activeGroupId === g.id ? 600 : 400,
                }}
              >
                {g.name}
              </button>
              <Switch checked={groupVisible} onChange={(v) => setGroupVisible(g.id, v)} label={`Show ${g.name}`} />
            </div>
          );
        })}
      </div>
      {activeGroupId && (
        <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Show agent
          </div>
          {(groups.find((g) => g.id === activeGroupId)?.agentIds || []).map((agentId) => (
            <div
              key={agentId}
              data-testid={`dock-agent-${agentId}`}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}
            >
              <span style={{ fontSize: 12, color: 'var(--ink)' }}>{agentId}</span>
              <Switch checked={isAgentVisible(dock, activeGroupId, agentId, groups.find((g) => g.id === activeGroupId)?.agentIds)} onChange={(v) => setAgentVisible(activeGroupId, agentId, v)} label={`Show ${agentId}`} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default DockVisibilityToggle;
