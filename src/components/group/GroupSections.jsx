import React from 'react';
import { Icon } from '../Icons.jsx';
import { AgentAvatar } from '../Agents.jsx';
import { groupAccent, groupSoft } from './styles.js';

export function SectionLabel({ children }) {
  return (
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 4 }}>
      {children}
    </div>
  );
}

export function GroupHeader({ groupName, groupHue, members, onUpdate, showSubPanel, setShowSubPanel }) {
  const accentColor = groupAccent(groupHue);
  const softColor = groupSoft(groupHue);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: softColor, border: `1.5px solid ${accentColor}`, display: 'grid', placeItems: 'center' }}>
        <Icon.Group size={20} color={accentColor} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--ink)' }}>{groupName}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)', letterSpacing: '0.06em', marginBottom: 4 }}>{members.length} members</div>
        <div style={{ position: 'relative', height: 8, width: 90, background: 'linear-gradient(to right, oklch(0.55 0.28 0), oklch(0.55 0.28 60), oklch(0.55 0.28 120), oklch(0.55 0.28 180), oklch(0.55 0.28 240), oklch(0.55 0.28 300), oklch(0.55 0.28 360))', borderRadius: 999, cursor: 'pointer', boxShadow: 'inset 0 0 0 1px oklch(0 0 0 / 0.05)' }}
          onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); const r = e.currentTarget.getBoundingClientRect(); onUpdate({ groupHue: Math.max(0, Math.min(360, Math.round(((e.clientX - r.left) / r.width) * 360))) }); }}
          onPointerMove={e => { if (e.buttons === 1) { const r = e.currentTarget.getBoundingClientRect(); onUpdate({ groupHue: Math.max(0, Math.min(360, Math.round(((e.clientX - r.left) / r.width) * 360))) }); } }}>
          <div style={{ position: 'absolute', left: `${(groupHue / 360) * 100}%`, top: '50%', transform: 'translate(-50%,-50%)', width: 10, height: 10, borderRadius: '50%', background: `oklch(0.55 0.28 ${groupHue})`, boxShadow: '0 0 0 1.5px white, 0 1px 3px oklch(0 0 0 / 0.3)', pointerEvents: 'none' }} />
        </div>
      </div>
      <div style={{ flex: 1 }} />
      <button onClick={() => setShowSubPanel(s => !s)} title="Sub-agents" style={{ all: 'unset', cursor: 'pointer', padding: '5px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-mono)', letterSpacing: '0.04em', textTransform: 'uppercase', color: showSubPanel ? accentColor : 'var(--ink-faint)', background: showSubPanel ? softColor : 'var(--surface-2)', border: `1px solid ${showSubPanel ? accentColor : 'var(--hairline)'}`, transition: 'all 0.15s' }}>
        Sub-agents
      </button>
    </div>
  );
}

export function GroupMembers({ members, onSpawn }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <SectionLabel>Members</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {members.map(agent => (
          <div key={agent.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 8, cursor: 'pointer', transition: 'background 0.1s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            onClick={() => onSpawn?.('agent', { agentId: agent.id })}>
            <AgentAvatar agent={agent} size={26} />
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{agent.name}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-faint)', flex: 1 }}>{agent.role}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function GroupMilestones({ milestones, newMilestone, setNewMilestone, addMilestone, toggleMilestone, groupHue }) {
  const accentColor = groupAccent(groupHue);
  return (
    <div>
      <SectionLabel>Recent Milestones</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {milestones.slice(0, 5).map(m => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--hairline)' }}>
            <button onClick={() => !m.completed && toggleMilestone(m.id)} style={{ all: 'unset', cursor: m.completed ? 'default' : 'pointer', width: 16, height: 16, borderRadius: 5, border: `1.5px solid ${m.completed ? accentColor : 'var(--hairline-strong)'}`, background: m.completed ? accentColor : 'transparent', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              {m.completed && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>}
            </button>
            <span style={{ fontSize: 12, color: m.completed ? 'var(--ink-faint)' : 'var(--ink)', textDecoration: m.completed ? 'line-through' : 'none' }}>{m.title}</span>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 4 }}>
          <input value={newMilestone} onChange={e => setNewMilestone(e.target.value)} placeholder="Add milestone..." onKeyDown={e => { if (e.key === 'Enter') addMilestone(); }}
            style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--hairline)', background: 'transparent', font: '12px var(--font-sans)', color: 'var(--ink)', outline: 'none' }} />
        </div>
      </div>
    </div>
  );
}

export function GroupGoals({ goals, newGoal, setNewGoal, addGoal, groupHue }) {
  const accentColor = groupAccent(groupHue);
  return (
    <div>
      <SectionLabel>Goals / Achievements</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {goals.slice(0, 5).map(g => (
          <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--hairline)' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: g.status === 'completed' ? accentColor : g.status === 'archived' ? 'var(--ink-faint)' : `oklch(0.75 0.12 ${groupHue})`, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: g.status === 'completed' ? 'var(--ink-faint)' : 'var(--ink)' }}>{g.title}</span>
            <div style={{ flex: 1 }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{g.status}</span>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 4 }}>
          <input value={newGoal} onChange={e => setNewGoal(e.target.value)} placeholder="Add goal..." onKeyDown={e => { if (e.key === 'Enter') addGoal(); }}
            style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--hairline)', background: 'transparent', font: '12px var(--font-sans)', color: 'var(--ink)', outline: 'none' }} />
        </div>
      </div>
    </div>
  );
}
