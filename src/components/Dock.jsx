import React from 'react';
import { useWorkspaceStore } from '../lib/store.js';
import ReactDOM from 'react-dom';
import { Icon } from './Icons.jsx';
import { AgentAvatar } from './Agents.jsx';
import { getAgents, getAgentById } from '../lib/agentStore.js';
import { isAgentVisible, isGroupVisible, useDockVisibility } from './dock/useDockVisibility.js';
import { DockVisibilityToggle } from './dock/DockVisibilityToggle.jsx';
import { useEscapeDismiss } from '../lib/useEscapeDismiss.js';

// Re-exported for backward compat — many consumers import DEFAULT_GROUPS
// from this file. The canonical home is now src/lib/dockDefaults.js
// (extracted in B3 to break the import cycle via useDockVisibility).
export { DEFAULT_GROUPS } from '../lib/dockDefaults.js';

export function MultiGroupDock({ groups, onGroupsChange, focusMode, dockOffset, onMoveDock, onDragAgent }) {
  const [moving, setMoving] = React.useState(false);
  const moveStart = React.useRef(null);
  const [drag, setDrag] = React.useState(null);
  const [editGroupId, setEditGroupId] = React.useState(null);
  const [addingGroup, setAddingGroup] = React.useState(false);
  // Brief B3 — dock visibility (master + per-group + per-agent).
  const { dock, visible: dockVisible } = useDockVisibility();
  const [showToggle, setShowToggle] = React.useState(false);
  const visibilityTriggerRef = React.useRef(null);

  const onMovePointerDown = (e) => { moveStart.current = { y: e.clientY, offset: dockOffset || 0 }; setMoving(true); e.currentTarget.setPointerCapture(e.pointerId); };
  const onMovePointerMove = (e) => { if (!moving || !moveStart.current) return; onMoveDock(Math.max(-240, Math.min(240, moveStart.current.offset + e.clientY - moveStart.current.y))); };
  const onMovePointerUp = (e) => { setMoving(false); moveStart.current = null; try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {} };

  const updateGroup = (id, patch) => onGroupsChange(groups.map(g => g.id === id ? { ...g, ...patch } : g));
  const removeGroup = (id) => onGroupsChange(groups.filter(g => g.id !== id));
  const addGroup = (g) => onGroupsChange([...groups, g]);

  const onAvatarPointerDown = (e, agent) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX, startY = e.clientY;
    let started = false;
    const onMove = (ev) => {
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      if (!started && Math.hypot(dx, dy) > 6) { started = true; setDrag({ agent, x: ev.clientX, y: ev.clientY }); }
      else if (started) setDrag({ agent, x: ev.clientX, y: ev.clientY });
    };
    const onUp = (ev) => {
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp);
      if (started) { setDrag(null); onDragAgent(agent, { x: ev.clientX, y: ev.clientY }); }
    };
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
  };

  // Brief B3 — collapsed marker when the dock is hidden. The marker
  // opens the visibility toggle so the user always has a way to bring
  // the dock back.
  if (!dockVisible) {
    return (
      <div style={{ position: 'absolute', right: 22, top: '50%', transform: `translateY(calc(-50% + ${dockOffset || 0}px))`, zIndex: 30 }}>
        <button
          ref={visibilityTriggerRef}
          type="button"
          onClick={() => setShowToggle((v) => !v)}
          data-testid="dock-collapsed-marker"
          title="Show dock"
          style={{ all: 'unset', cursor: 'pointer', width: 28, height: 28, borderRadius: '50%', background: 'var(--surface)', color: 'var(--ink-soft)', display: 'grid', placeItems: 'center', boxShadow: 'inset 0 0 0 1px var(--hairline), 0 1px 2px oklch(0 0 0 / 0.05)' }}
        >
          <Icon.Group size={14} />
        </button>
        {showToggle && <DockVisibilityToggle groups={groups} anchorRef={visibilityTriggerRef} onClose={() => setShowToggle(false)} />}
      </div>
    );
  }

  return (
    <div style={{ position: 'absolute', right: 22, top: '50%', transform: `translateY(calc(-50% + ${dockOffset || 0}px))`, zIndex: 30, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, opacity: focusMode ? 0 : 1, transition: 'opacity 0.4s ease', pointerEvents: focusMode ? 'none' : 'auto' }}
      onMouseEnter={(e) => { if (focusMode) { e.currentTarget.style.opacity = 1; e.currentTarget.style.pointerEvents = 'auto'; } }}
      onMouseLeave={(e) => { if (focusMode) { e.currentTarget.style.opacity = 0; e.currentTarget.style.pointerEvents = 'none'; } }}>
      {groups.filter(g => isGroupVisible(dock, g.id, g.agentIds)).map(g => <GroupRail key={g.id} group={{ ...g, agentIds: g.agentIds.filter(id => isAgentVisible(dock, g.id, id, g.agentIds)) }} onToggle={() => updateGroup(g.id, { collapsed: !g.collapsed })} onEdit={() => setEditGroupId(g.id)} onAvatarPointerDown={onAvatarPointerDown} onMovePointerDown={onMovePointerDown} onMovePointerMove={onMovePointerMove} onMovePointerUp={onMovePointerUp} moving={moving} />)}
      <button onClick={() => setAddingGroup(true)} title="Add group" style={{ all: 'unset', cursor: 'pointer', width: 32, height: 32, borderRadius: '50%', background: 'var(--surface)', color: 'var(--ink-faint)', display: 'grid', placeItems: 'center', boxShadow: 'inset 0 0 0 1px var(--hairline), 0 1px 2px oklch(0 0 0 / 0.05)' }}><Icon.Plus size={14} /></button>
      <button ref={visibilityTriggerRef} onClick={() => setShowToggle((v) => !v)} title="Toggle dock visibility" data-testid="dock-visibility-btn" style={{ all: 'unset', cursor: 'pointer', width: 32, height: 32, borderRadius: '50%', background: 'var(--surface)', color: 'var(--ink-faint)', display: 'grid', placeItems: 'center', boxShadow: 'inset 0 0 0 1px var(--hairline), 0 1px 2px oklch(0 0 0 / 0.05)' }}><Icon.Gear size={14} /></button>
      {showToggle && <DockVisibilityToggle groups={groups} anchorRef={visibilityTriggerRef} onClose={() => setShowToggle(false)} />}
      {editGroupId && <GroupEditor group={groups.find(g => g.id === editGroupId)} onSave={(patch) => { updateGroup(editGroupId, patch); setEditGroupId(null); }} onDelete={() => { if (groups.length > 1) { removeGroup(editGroupId); setEditGroupId(null); } }} canDelete={groups.length > 1} onClose={() => setEditGroupId(null)} />}
      {addingGroup && <GroupEditor group={{ id: '', name: '', hue: Math.round(Math.random() * 360), agentIds: [], collapsed: false }} onSave={(g) => { addGroup({ ...g, id: (g.name || 'group').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.random().toString(36).slice(2, 6) }); setAddingGroup(false); }} onClose={() => setAddingGroup(false)} isNew />}
      {drag && ReactDOM.createPortal(<div style={{ position: 'fixed', left: drag.x - 16, top: drag.y - 16, pointerEvents: 'none', zIndex: 1000, filter: 'drop-shadow(0 8px 14px oklch(0 0 0 / 0.25))' }}><AgentAvatar agent={drag.agent} size={32} ring /></div>, document.body)}
    </div>
  );
}

function GroupRail({ group, onToggle, onEdit, onAvatarPointerDown, onMovePointerDown, onMovePointerMove, onMovePointerUp, moving }) {
  const agents = group.agentIds.map(id => getAgentById(id)).filter(Boolean);
  return (
    <div data-dock-group={group.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 12, padding: 5, boxShadow: 'var(--shadow-card)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 44 }}>
        <div style={{ position: 'relative' }} className="group-tag">
          <button onClick={onToggle} onPointerDown={onMovePointerDown} onPointerMove={onMovePointerMove} onPointerUp={onMovePointerUp} onPointerCancel={onMovePointerUp}
            title={group.collapsed ? `Expand ${group.name}` : `Collapse ${group.name}`}
            style={{ all: 'unset', cursor: moving ? 'grabbing' : 'pointer', width: 32, height: 32, borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--accent-ink)', display: 'grid', placeItems: 'center', boxShadow: 'inset 0 0 0 1px var(--accent)', position: 'relative' }}>
            <Icon.Group size={16} />
            {group.collapsed && <div style={{ position: 'absolute', right: -6, bottom: -6, background: 'var(--accent)', color: 'white', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 999, fontFamily: 'var(--font-mono)' }}>{agents.length}</div>}
          </button>
          <button onClick={onEdit} title="Edit group" className="group-edit-btn" style={{ all: 'unset', cursor: 'pointer', position: 'absolute', left: -22, top: 6, width: 16, height: 16, borderRadius: '50%', background: 'var(--surface)', color: 'var(--ink-soft)', boxShadow: 'inset 0 0 0 1px var(--hairline)', display: 'grid', placeItems: 'center', opacity: 0, transition: 'opacity 0.2s' }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateRows: group.collapsed ? '0fr' : '1fr', transition: 'grid-template-rows 0.32s cubic-bezier(.4,.0,.2,1)', width: '100%', overflow: 'hidden' }}>
          <div style={{ minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, paddingTop: group.collapsed ? 0 : 4 }}>
            {agents.map(a => <div key={a.id} data-dock-agent={a.id} onPointerDown={(e) => onAvatarPointerDown(e, a)} style={{ cursor: 'grab' }} title={`Drag ${a.name} onto canvas`}><AgentAvatar agent={a} size={32} /></div>)}
            {agents.length === 0 && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--ink-faint)', letterSpacing: '0.04em', writingMode: 'vertical-rl', transform: 'rotate(180deg)', padding: '6px 2px' }}>empty</div>}
          </div>
        </div>
      </div>
      {!group.collapsed && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', maxWidth: 44, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{group.name}</div>}
    </div>
  );
}

function GroupEditor({ group, onSave, onDelete, onClose, canDelete, isNew }) {
  useEscapeDismiss(true, onClose);
  const agents = getAgents();
  const [name, setName] = React.useState(group.name);
  const [hue, setHue] = React.useState(group.hue);
  const [agentIds, setAgentIds] = React.useState(group.agentIds);
  const toggle = (id) => setAgentIds(agentIds.includes(id) ? agentIds.filter(x => x !== id) : [...agentIds, id]);

  return ReactDOM.createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'oklch(0 0 0 / 0.15)', zIndex: 200 }} />
      <div role="dialog" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 210, width: 380, background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 16, padding: 18, boxShadow: 'var(--shadow-pop)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>{isNew ? 'new group' : 'edit group'}</div>
          <div style={{ flex: 1 }} /><button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', color: 'var(--ink-faint)' }}><Icon.Close size={14}/></button>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-faint)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Editorial" style={{ width: '100%', border: '1px solid var(--hairline)', background: 'var(--surface-2)', borderRadius: 8, padding: '8px 10px', font: '13px/1.3 var(--font-sans)', color: 'var(--ink)', outline: 'none' }} />
        </label>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-faint)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Accent tint</div>
          <div style={{ position: 'relative', height: 22, background: 'linear-gradient(to right, var(--surface-2), var(--accent-soft), var(--accent))', border: '1px solid var(--hairline)', borderRadius: 999, cursor: 'pointer' }}
            onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHue(Math.round(((e.clientX - r.left) / r.width) * 360)); }}>
            <div style={{ position: 'absolute', left: `${(hue/360)*100}%`, top: '50%', transform: 'translate(-50%,-50%)', width: 16, height: 16, borderRadius: 6, background: 'var(--accent)', boxShadow: '0 0 0 2px var(--surface), 0 0 0 3px var(--hairline-strong)', pointerEvents: 'none' }}/>
          </div>
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-faint)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Members</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {agents.map(a => {
              const on = agentIds.includes(a.id);
              return <button key={a.id} onClick={() => toggle(a.id)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px 4px 4px', borderRadius: 8, background: on ? 'var(--accent-soft)' : 'var(--surface-2)', border: '1px solid ' + (on ? 'var(--accent)' : 'var(--hairline)'), color: 'var(--ink)' }}>
                <AgentAvatar agent={a} size={18} /><span style={{ fontSize: 11 }}>{a.name}</span>
              </button>;
            })}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, gap: 8 }}>
          <div>{!isNew && canDelete && <button onClick={onDelete} style={{ all: 'unset', cursor: 'pointer', fontSize: 11, color: 'var(--ps-red)', padding: '6px 10px' }}>Delete group</button>}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', padding: '7px 12px', borderRadius: 999, color: 'var(--ink-soft)', fontSize: 12, fontWeight: 600 }}>Cancel</button>
            <button onClick={() => onSave({ name: name.trim() || 'Group', hue, agentIds })} style={{ all: 'unset', cursor: 'pointer', padding: '7px 16px', borderRadius: 8, background: 'var(--accent)', color: 'white', fontSize: 12, fontWeight: 600 }}>{isNew ? 'Create' : 'Save'}</button>
          </div>
        </div>
      </div>
    </>, document.body
  );
}
