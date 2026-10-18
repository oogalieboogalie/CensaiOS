import React from 'react';
import { FAMILY_AGENTS, FAMILY_AGENT_BY_ID } from '../data/family-agents.js';
import { useEscapeDismiss } from '../lib/useEscapeDismiss.js';

// "Equip to" on the Browser window: hand the window to one agent, who can then
// open pages in it (the browser_go tool) while everyone watches. The list is
// a strip under the address bar, not a floating menu, so the desktop app's
// page view (which sits on top of everything) never hides it.

export function BrowserEquipButton({ equippedAgentId, open, onToggle }) {
  const agent = FAMILY_AGENT_BY_ID[equippedAgentId];
  return (
    <button
      type="button"
      data-testid="browser-equip-button"
      onClick={onToggle}
      onPointerDown={(e) => e.stopPropagation()}
      title="Equip this browser to an agent so it can browse here"
      style={{
        all: 'unset', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
        padding: '3px 9px', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)', fontWeight: 650,
        border: '1px solid var(--hairline)', background: open ? 'var(--surface-3)' : 'var(--surface)',
        color: agent ? 'var(--ink)' : 'var(--ink-soft)', whiteSpace: 'nowrap',
      }}
    >
      {agent ? `Equipped: ${agent.name}` : 'Unequipped'}
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M6 9l6 6 6-6" /></svg>
    </button>
  );
}

export function BrowserEquipMenu({ equippedAgentId, onEquip, onClose }) {
  useEscapeDismiss(true, onClose);
  const pick = (id) => { onEquip(id); onClose(); };
  return (
    <div
      role="menu"
      data-testid="browser-equip-menu"
      onPointerDown={(e) => e.stopPropagation()}
      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: '1px solid var(--hairline)', background: 'var(--surface-2)' }}
    >
      <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--ink-soft)', marginRight: 4 }}>Equip to:</span>
      {FAMILY_AGENTS.map((agent) => {
        const on = agent.id === equippedAgentId;
        return (
          <button
            key={agent.id}
            type="button"
            role="menuitemradio"
            aria-checked={on}
            onClick={() => pick(agent.id)}
            style={{
              all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: '3px 9px',
              borderRadius: 'var(--radius-pill, 999px)', fontSize: 'var(--text-xs)',
              border: `1px solid ${on ? 'var(--accent)' : 'var(--hairline)'}`,
              background: on ? 'var(--accent-soft)' : 'var(--surface)', color: 'var(--ink)',
            }}
          >
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', border: '1.5px solid currentColor', background: on ? 'currentColor' : 'transparent' }} />
            {agent.name}
          </button>
        );
      })}
      {equippedAgentId && (
        <button type="button" onClick={() => pick(null)} style={{ all: 'unset', cursor: 'pointer', marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--ink-soft)', textDecoration: 'underline' }}>
          Unequip
        </button>
      )}
    </div>
  );
}
