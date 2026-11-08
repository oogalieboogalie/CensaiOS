import React from 'react';
import { Icon } from '../Icons.jsx';
import { AgentAvatar } from '../Agents.jsx';
import { getAgents, getAgentById } from '../../lib/agentStore.js';
import { useSharedCaret } from '../../lib/collaboration/useSharedCaret.js';
import { useCaretReporter, useTeammateCarets } from '../../lib/collaboration/useTextCarets.js';
import { TeammateCarets } from '../collaboration/TeammateCarets.jsx';
import { IdeaBullet } from './IdeaBullet.jsx';
import { panelStyle, sectionHeaderStyle, addInputStyle, tagInputStyle, assigneeSelectStyle, emptyAssigneeStyle, addButtonStyle } from './ideaBulletsStyles.js';

export function IdeaBulletsSection({
  winId,
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
  // A teammate's letters landing in the save tag keep your cursor where it was.
  const tagRef = React.useRef(null);
  useSharedCaret(tagRef, workItem, React.useMemo(() => ({ id: winId, field: 'workItem' }), [winId]));
  // Teammates' cursors in the save tag, with their names, and ours for them.
  useCaretReporter(tagRef, winId, 'workItem');
  const tagCarets = useTeammateCarets(winId, 'workItem');

  return (
    <section style={panelStyle}>
      <div style={sectionHeaderStyle}>
        <span>Idea bullets</span>
        <span>{ideas.length}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, borderRadius: 'var(--radius-lg)', background: 'var(--surface-2)', border: '1px solid var(--hairline)' }}>
        <label style={{ fontFamily: 'var(--font-label)', fontSize: 'var(--text-xs)', fontWeight: 800, textTransform: 'var(--label-case)', letterSpacing: 'var(--label-tracking)', color: 'var(--ink-faint)' }}>
          Save tag
        </label>
        <div style={{ position: 'relative', display: 'grid' }}>
          <input
            ref={tagRef}
            aria-label="Save tag"
            value={workItem}
            onChange={(e) => { setWorkItem(e.target.value); setSavedIdea(null); }}
            placeholder="Website Update"
            style={tagInputStyle}
          />
          <TeammateCarets boxRef={tagRef} carets={tagCarets} text={workItem} />
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', lineHeight: 1.35 }}>
          [{currentProject?.name || 'Project'}] - {workItem.trim() || 'Work item'} - Ideated on today
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, borderRadius: 'var(--radius-lg)', background: 'var(--surface-2)', border: '1px solid var(--hairline)' }}>
        <label style={{ fontFamily: 'var(--font-label)', fontSize: 'var(--text-xs)', fontWeight: 800, textTransform: 'var(--label-case)', letterSpacing: 'var(--label-tracking)', color: 'var(--ink-faint)' }}>
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
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', lineHeight: 1.35 }}>
          {assignee ? 'Save writes the idea note and queues an agent task.' : 'Choose an agent to queue a task from this idea.'}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 7, paddingRight: 2 }}>
        {ideas.length === 0 ? (
          <div style={{ color: 'var(--ink-faint)', fontSize: 'var(--text-sm)', lineHeight: 1.5, padding: '10px 2px' }}>
            Throw messy fragments here. Press Enter or the plus button and they become bullets.
          </div>
        ) : ideas.map((idea, index) => (
          <IdeaBullet key={index} idea={idea} index={index} onChange={updateIdea} onRemove={removeIdea} winId={winId} />
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

