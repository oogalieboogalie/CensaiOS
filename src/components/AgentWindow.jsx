import React from 'react';
import { AgentAvatar } from './Agents.jsx';
import { api } from '../lib/api.js';
import { WindowTitle } from './Windows.jsx';
import { Stat, JournalCard, PillBtn } from './agent/AgentStats.jsx';
import { AgentEditor } from './agent/AgentEditor.jsx';
import { useAgentWindow } from './agent/useAgentWindow.js';
import { defaultToolsForAgent } from './agent/AgentData.js';
import { useAgentActivity } from './agent/useAgentActivity.js';
import { AgentActivityCard } from './agent/AgentActivityCard.jsx';
import { useWorkspaceStore } from '../lib/store.js';

export function AgentWindow({ win, onUpdate, onSpawn }) {
  const workspaceId = useWorkspaceStore(state => state.workspaceId);
  const {
    agent,
    editing, setEditing,
    draft, setDraft,
    draftProvider, setDraftProvider,
    draftModel, setDraftModel,
    draftTools, setDraftTools,
    toolCatalog, toolSearch, setToolSearch,
    saveStatus, textRef,
    currentPrompt,
    saveSystem, cancelEdit
  } = useAgentWindow(win, onUpdate);

  const [journalCount, setJournalCount] = React.useState(0);
  const activity = useAgentActivity(agent?.id);
  React.useEffect(() => {
    if (!agent?.id) return;
    let alive = true;
    api.getJournalCount(agent.id, workspaceId).then(count => { if (alive) setJournalCount(count); });
    return () => { alive = false; };
  }, [agent?.id, workspaceId]);

  if (!agent) return null;

  const status = 'idle';

  return (
    <>
      <WindowTitle agent={agent} label={agent.name} subtitle={agent.role} attachedAgentIds={win.attachedAgents} onDetach={(id) => onUpdate({ attachedAgents: (win.attachedAgents || []).filter(a => a !== id) })} />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <AgentAvatar agent={agent} size={48} ring />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--ink)' }}>{agent.name}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{agent.role}</div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: status === 'drafting' ? `oklch(0.32 0.10 ${agent.hue})` : 'var(--ink-faint)', background: status === 'drafting' ? `oklch(0.94 0.04 ${agent.hue})` : 'var(--surface-2)', padding: '3px 8px', borderRadius: 999, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: status === 'drafting' ? `oklch(0.62 0.14 ${agent.hue})` : 'var(--ink-faint)' }} />{status}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Stat label="Tools" value={defaultToolsForAgent(agent).length} />
          <JournalCard agent={agent} count={journalCount} />
        </div>
        <AgentActivityCard activity={activity} />
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>System</div>
          {editing ? (
            <AgentEditor
              agent={agent} draft={draft} setDraft={setDraft}
              draftProvider={draftProvider} setDraftProvider={setDraftProvider}
              draftModel={draftModel} setDraftModel={setDraftModel}
              draftTools={draftTools} setDraftTools={setDraftTools}
              toolCatalog={toolCatalog} toolSearch={toolSearch} setToolSearch={setToolSearch}
              saveStatus={saveStatus} onSave={saveSystem} onCancel={cancelEdit}
              textRef={textRef}
            />
          ) : (
            <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--ink-soft)', background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 10, padding: 10 }}>
              {currentPrompt}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
          <PillBtn onClick={() => onSpawn?.('chat', { agentId: agent.id })}>Open chat</PillBtn>
          <PillBtn ghost onClick={() => { if (editing) cancelEdit(); else { setDraft(currentPrompt); setEditing(true); } }}>{editing ? 'Cancel edit' : 'Edit system'}</PillBtn>
        </div>
      </div>
    </>
  );
}
