import React from 'react';
import { Icon } from '../Icons.jsx';
import { getAgentById } from '../../lib/agentStore.js';
import { groupAccent, groupSoft, fieldStyle, smallSelectStyle } from './styles.js';
import { useWorkspaceStore } from '../../lib/store.js';

// Sub-agent listing grouped by parent agent, plus the inline create form.
export function SubAgentRoster({ subAgents, setSubAgents, members, groupHue, creating, setCreating, newParent, setNewParent }) {
  const workspaceId = useWorkspaceStore(state => state.workspaceId);
  const [newName, setNewName] = React.useState('');
  const [newRole, setNewRole] = React.useState('');
  const nameRef = React.useRef(null);
  const accentColor = groupAccent(groupHue);
  const softColor = groupSoft(groupHue);

  React.useEffect(() => { if (creating) setTimeout(() => nameRef.current?.focus(), 30); }, [creating]);

  const createSub = async () => {
    if (!newName.trim() || !newParent || !workspaceId) return;
    try {
      const res = await fetch('/api/sub-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId: newParent, name: newName.trim(), role: newRole.trim() || null, workspaceId }),
      });
      if (res.ok) {
        const sub = await res.json();
        setSubAgents(prev => [...prev, sub]);
        setNewName('');
        setNewRole('');
        setCreating(false);
      }
    } catch {}
  };

  const removeSub = async (id) => {
    try {
      await fetch(`/api/sub-agents/${id}?workspaceId=${encodeURIComponent(workspaceId)}`, { method: 'DELETE' });
      setSubAgents(prev => prev.filter(s => s.id !== id));
    } catch {}
  };

  // Group sub-agents by parent
  const byParent = {};
  for (const s of subAgents) {
    if (!byParent[s.parent_id]) byParent[s.parent_id] = [];
    byParent[s.parent_id].push(s);
  }

  return (
    <>
      {Object.entries(byParent).map(([parentId, subs]) => {
        const parent = getAgentById(parentId);
        return (
          <div key={parentId}>
            {members.length > 1 && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-faint)', letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 6px' }}>
                {parent?.name || parentId}
              </div>
            )}
            {subs.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, transition: 'background 0.1s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: `oklch(0.88 0.06 ${s.hue || groupHue})`, border: `1px solid oklch(0.72 0.10 ${s.hue || groupHue})`, display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700, color: `oklch(0.40 0.10 ${s.hue || groupHue})` }}>
                  {(s.name[0] || '?').toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink)' }}>{s.name}</div>
                  {s.role && <div style={{ fontSize: 10, color: 'var(--ink-faint)' }}>{s.role}</div>}
                </div>
                <button onClick={() => removeSub(s.id)} title="Remove" style={{ all: 'unset', cursor: 'pointer', width: 18, height: 18, borderRadius: 4, display: 'grid', placeItems: 'center', color: 'var(--ink-faint)', opacity: 0.5, transition: 'opacity 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.opacity = 1}
                  onMouseLeave={e => e.currentTarget.style.opacity = 0.5}>
                  <Icon.Close size={10} />
                </button>
              </div>
            ))}
          </div>
        );
      })}
      {creating && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, borderRadius: 8, border: `1px dashed ${accentColor}`, background: softColor }}>
          <select value={newParent} onChange={e => setNewParent(e.target.value)}
            style={smallSelectStyle}>
            {members.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input ref={nameRef} value={newName} onChange={e => setNewName(e.target.value)} placeholder="Sub-agent name..." onKeyDown={e => { if (e.key === 'Enter') createSub(); if (e.key === 'Escape') setCreating(false); }}
            style={fieldStyle} />
          <input value={newRole} onChange={e => setNewRole(e.target.value)} placeholder="Role (e.g. Researcher, Summarizer)..." onKeyDown={e => { if (e.key === 'Enter') createSub(); if (e.key === 'Escape') setCreating(false); }}
            style={fieldStyle} />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button onClick={() => setCreating(false)} style={{ all: 'unset', cursor: 'pointer', padding: '4px 10px', borderRadius: 6, fontSize: 11, color: 'var(--ink-faint)' }}>Cancel</button>
            <button onClick={createSub} disabled={!newName.trim() || !workspaceId} style={{ all: 'unset', cursor: newName.trim() && workspaceId ? 'pointer' : 'not-allowed', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: accentColor, color: '#fff', opacity: newName.trim() && workspaceId ? 1 : 0.5 }}>Create</button>
          </div>
        </div>
      )}
    </>
  );
}
