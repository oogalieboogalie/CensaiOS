import React from 'react';
import { Panel, Empty, toneColor } from './OperationsShared.jsx';

export function ActiveAgentsPanel({ activeAgents }) {
  return (
    <Panel title="Actively Running">
      {activeAgents.length === 0 ? (
        <Empty text="No agent is actively executing right now." />
      ) : (
        <div style={{ display: 'grid', gap: 7 }}>
          {activeAgents.map(agent => (
            <div key={agent.id} style={{ display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr) auto', gap: 8, alignItems: 'center', padding: 8, border: '1px solid var(--hairline)', borderRadius: 8, background: 'var(--surface-2)' }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center', background: `oklch(0.90 0.05 ${agent.hue || 205})`, color: `oklch(0.42 0.13 ${agent.hue || 205})`, fontWeight: 800, fontSize: 12 }}>
                {agent.initial}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.name}</div>
                <div style={{ fontSize: 10.5, color: 'var(--ink-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.detail}</div>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: toneColor(agent.tone), textTransform: 'uppercase', letterSpacing: '0.05em' }}>{agent.kind}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
