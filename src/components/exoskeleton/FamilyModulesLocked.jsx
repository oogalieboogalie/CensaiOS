import React from 'react';
import { AgentAvatar } from '../Agents.jsx';

export function FamilyModulesLocked({ agent, loading = false }) {
  const avatar = React.createElement(AgentAvatar, { agent, size: 44 });
  return (
    <section style={{
      flex: 1,
      display: 'grid',
      placeItems: 'center',
      padding: 32,
      background: 'var(--surface-2)',
    }}>
      <div style={{
        width: 'min(520px, 100%)',
        display: 'grid',
        gap: 16,
        padding: 24,
        border: '1px solid var(--hairline)',
        borderRadius: 16,
        background: 'var(--surface)',
        boxShadow: 'var(--shadow-card)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {avatar}
          <div>
            <div style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 750 }}>
              {loading ? 'Loading workspace modules' : 'Open a workspace to equip modules'}
            </div>
            <div style={{ color: 'var(--ink-faint)', fontSize: 11, marginTop: 3 }}>
              {agent?.name || 'Team agent'} · workspace boundary
            </div>
          </div>
        </div>
        <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: 12, lineHeight: 1.6 }}>
          {loading
            ? 'The editor stays locked until this workspace\'s saved module selection is loaded.'
            : 'Tool modules are additive and belong to one workspace. Open or create a workspace before reviewing this agent\'s read-only modules.'}
        </p>
        <span style={{ color: 'var(--ink-faint)', fontSize: 11 }}>
          Global role tools remain policy-managed and are never replaced by modules.
        </span>
      </div>
    </section>
  );
}
