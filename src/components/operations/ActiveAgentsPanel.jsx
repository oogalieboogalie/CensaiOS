import React from 'react';
import { Panel, Empty, toneColor } from './OperationsShared.jsx';
import { AgentAvatar } from '../Agents.jsx';
import { getAgentById } from '../../lib/agentStore.js';

// The agent's own face (family mark, or the icon its owner picked) when it is
// a known agent; a sub-agent or Jules wears the mark in its own colour.
const faceOf = (agent) => getAgentById(agent.id) || { id: agent.id, name: agent.name, role: agent.detail || agent.kind, hue: agent.hue ?? 205 };

export function ActiveAgentsPanel({ activeAgents }) {
  return (
    <Panel title="Actively Running">
      {activeAgents.length === 0 ? (
        <Empty text="No agent is actively executing right now." />
      ) : (
        <div style={{ display: 'grid', gap: 7 }}>
          {activeAgents.map(agent => (
            <div key={agent.id} style={{ display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr) auto', gap: 8, alignItems: 'center', padding: 8, border: '1px solid var(--hairline)', borderRadius: 'var(--radius-lg)', background: 'var(--surface-2)' }}>
              <AgentAvatar agent={faceOf(agent)} size={28} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.name}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.detail}</div>
              </div>
              <span style={{ fontFamily: 'var(--font-label)', fontSize: 'var(--text-xs)', color: toneColor(agent.tone), textTransform: 'var(--label-case)', letterSpacing: 'var(--label-tracking)' }}>{agent.kind}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
