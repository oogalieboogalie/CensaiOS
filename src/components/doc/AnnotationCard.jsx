import React from 'react';
import { Icon } from '../Icons.jsx';
import { AgentAvatar } from '../Agents.jsx';
import { getAgentById } from '../../lib/agentStore.js';
import { ANNOTATION_COLORS } from './DocData.js';

export function AnnotationCard({ ann, isActive, onClick, onRemove }) {
  const c = ANNOTATION_COLORS[ann.kind];
  const agent = ann.agentId ? getAgentById(ann.agentId) : null;
  return (
    <div onClick={onClick} style={{ background: 'var(--surface)', border: '1px solid ' + (isActive ? c.ring : 'var(--hairline)'), borderLeft: `3px solid ${c.ring}`, borderRadius: 8, padding: 8, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {agent ? <AgentAvatar agent={agent} size={16} /> : <div style={{ width: 16, height: 16, borderRadius: '50%', background: c.ring, color: 'white', display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>·</div>}
        <span style={{ fontSize: 11, color: 'var(--ink)', fontWeight: 600 }}>{ann.author}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: c.ink, background: c.bg, padding: '1px 5px', borderRadius: 4, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{ann.kind}</span>
        <div style={{ flex: 1 }} />
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} title="Remove" style={{ all: 'unset', cursor: 'pointer', color: 'var(--ink-faint)' }}><Icon.Close size={10}/></button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink-faint)', borderLeft: `2px solid ${c.ring}`, paddingLeft: 6, fontStyle: 'italic', maxHeight: 38, overflow: 'hidden' }}>"{ann.quote.length > 80 ? ann.quote.slice(0, 80) + '…' : ann.quote}"</div>
      {ann.body && <div style={{ fontSize: 12, color: 'var(--ink)' }}>{ann.body}</div>}
    </div>
  );
}
