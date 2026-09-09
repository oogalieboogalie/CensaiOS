import React from 'react';
import { Icon } from '../Icons.jsx';
import { AgentAvatar } from '../Agents.jsx';
import { getAgents, getAgentById } from '../../lib/agentStore.js';
import { panelStyle, sectionHeaderStyle, bulletInputStyle, addInputStyle, tagInputStyle, assigneeSelectStyle, emptyAssigneeStyle, addButtonStyle, iconButtonStyle } from './ideaBulletsStyles.js';

export function IdeaBulletsSection({
  ideas,
  workItem,
  setWorkItem,
  assignee,
  setAssignee,
  draft,
  setDraft,
  addIdea,
  updateIdea,
  removeIdea,
  inputRef,
  currentProject,
  setSavedIdea,
  setStatus,
}) {
  const agents = getAgents();
  const selectedAgent = assignee ? getAgentById(assignee) : null;

  return (
    <section style={panelStyle}>
      <div style={sectionHeaderStyle}>
        <span>Idea bullets</span>
        <span>{ideas.length}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--hairline)' }}>
        <label style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-faint)' }}>
          Save tag
        </label>
        <input
          value={workItem}
          onChange={(e) => { setWorkItem(e.target.value); setSavedIdea(null); }}
          placeholder="Website Update"
          style={tagInputStyle}
        />
        <div style={{ fontSize: 10, color: 'var(--ink-faint)', lineHeight: 1.35 }}>
          [{currentProject?.name || 'Project'}] - {workItem.trim() || 'Work item'} - Ideated on today
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--hairline)' }}>
        <label style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-faint)' }}>
          Handoff
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, alignItems: 'center' }}>
          <select
            value={assignee}
            onChange={(e) => { setAssignee(e.target.value); setSavedIdea(null); setStatus(''); }}
            style={assigneeSelectStyle}
          >
            <option value="">Save note only</option>
            {agents.map(agent => (
              <option key={agent.id} value={agent.id}>{agent.name}</option>
            ))}
          </select>
          {selectedAgent ? <AgentAvatar agent={selectedAgent} size={28} /> : <div style={emptyAssigneeStyle}><Icon.ArrowAssign size={13} /></div>}
        </div>
        <div style={{ fontSize: 10, color: 'var(--ink-faint)', lineHeight: 1.35 }}>
          {assignee ? 'Save writes the idea note and queues an agent task.' : 'Choose an agent to queue a task from this idea.'}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 7, paddingRight: 2 }}>
        {ideas.length === 0 ? (
          <div style={{ color: 'var(--ink-faint)', fontSize: 12, lineHeight: 1.5, padding: '10px 2px' }}>
            Throw messy fragments here. Press Enter or the plus button and they become bullets.
          </div>
        ) : ideas.map((idea, index) => (
          <div key={index} style={{ display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr) 20px', gap: 6, alignItems: 'start' }}>
            <div style={{ width: 7, height: 7, borderRadius: 99, background: 'var(--accent)', marginTop: 10, justifySelf: 'center' }} />
            <textarea
              value={idea}
              onChange={(e) => updateIdea(index, e.target.value)}
              rows={1}
              style={bulletInputStyle}
            />
            <button onClick={() => removeIdea(index)} title="Remove idea" style={iconButtonStyle}>
              <Icon.Close size={10} />
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 34px', gap: 8, paddingTop: 10, borderTop: '1px solid var(--hairline)' }}>
        <input
          ref={inputRef}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              addIdea();
            }
          }}
          placeholder="Add a thought..."
          style={addInputStyle}
        />
        <button onClick={addIdea} disabled={!draft.trim()} title="Add bullet" style={{ ...addButtonStyle, opacity: draft.trim() ? 1 : 0.45, cursor: draft.trim() ? 'pointer' : 'not-allowed' }}>
          <Icon.Plus size={14} />
        </button>
      </div>
    </section>
  );
}

