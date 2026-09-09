import React from 'react';
import { Icon } from './Icons.jsx';
import { AgentAvatar } from './Agents.jsx';
import { getAgentById } from '../lib/agentStore.js';
import { WindowTitle } from './Windows.jsx';

export function WorkflowWindow({ win, onUpdate }) {
  return (
    <>
      <WindowTitle icon={<Icon.NewWorkflow size={14}/>} label={win.title || 'Workflow'} subtitle={win.subtitle || 'weekly newsletter'} attachedAgentIds={win.attachedAgents} onDetach={(id) => onUpdate?.({ attachedAgents: (win.attachedAgents || []).filter(a => a !== id) })} />
      <div style={{ flex: 1, minHeight: 0, padding: 14, position: 'relative', overflow: 'auto' }}>
        <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none', width: '100%', height: '100%' }}>
          <defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10 Z" fill="var(--ink-soft)" /></marker></defs>
          <path d="M 110 56 L 175 56" stroke="var(--ink-faint)" strokeWidth="1.5" fill="none" markerEnd="url(#arr)" />
          <path d="M 110 132 L 175 132" stroke="var(--ink-faint)" strokeWidth="1.5" fill="none" markerEnd="url(#arr)" />
          <path d="M 110 208 L 175 208" stroke="var(--ink-faint)" strokeWidth="1.5" fill="none" markerEnd="url(#arr)" />
        </svg>
        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', rowGap: 18, columnGap: 80, padding: '4px 8px' }}>
          <WFNode color="var(--ps-blue)" icon={<Icon.Calendar size={12}/>} label="Mon 9am" sub="trigger" />
          <WFCard agentId="censai" title="Draft sections" sub="Pulls headlines · writes outline" />
          <WFNode color="var(--ps-pink)" icon={<Icon.Eye size={12}/>} label="Review" sub="human in loop" />
          <WFCard agentId="genesis" title="Layout pass" sub="Cover art · typography" />
          <WFNode color="var(--ps-green)" icon={<Icon.Check size={12}/>} label="Publish" sub="Mon 5pm" />
          <WFCard agentId="echo" title="Distribution" sub="Social + analytics" />
        </div>
      </div>
    </>
  );
}

function WFNode({ color, icon, label, sub }) {
  return <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 8, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--hairline)', width: 90 }}>
    <div style={{ width: 22, height: 22, borderRadius: 6, background: color, display: 'grid', placeItems: 'center', color: 'oklch(1 0 0)', marginBottom: 4 }}>{icon}</div>
    <div style={{ fontSize: 12, fontWeight: 600 }}>{label}</div>
    <div style={{ fontSize: 9.5, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{sub}</div>
  </div>;
}

function WFCard({ agentId, title, sub }) {
  const agent = getAgentById(agentId);
  return <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--hairline)', boxShadow: '0 1px 0 oklch(0 0 0 / 0.02)' }}>
    <AgentAvatar agent={agent} size={24} /><div style={{ display: 'flex', flexDirection: 'column' }}><div style={{ fontSize: 12.5, fontWeight: 600 }}>{title}</div><div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>{sub}</div></div>
  </div>;
}
