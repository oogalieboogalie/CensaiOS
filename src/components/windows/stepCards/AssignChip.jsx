import React from 'react';
import { Icon } from '../../Icons.jsx';
import { AgentAvatar } from '../../Agents.jsx';
import { getAgents, getAgentById } from '../../../lib/agentStore.js';
import { codingAgentLabel, parseAssignee } from '../../../lib/todos/assignees.js';
import { TodoAssignMenu } from '../../todos/TodoAssignMenu.jsx';
import { PersonBadge } from '../../todos/PersonBadge.jsx';
import { CliMark } from '../../agentConsole/CliMark.jsx';

/** Who an assignee value is, in words: "Grok", "Atlas", "Sam". */
export function assigneeWords(card) {
  const who = parseAssignee(card?.assignee);
  if (!who) return '';
  if (who.type === 'cli') return codingAgentLabel(who.id);
  if (who.type === 'person') return card.assigneeName || 'a teammate';
  return getAgentById(who.id)?.name || card.assigneeName || who.id;
}

export function AssigneeFace({ card, size = 20 }) {
  const who = parseAssignee(card?.assignee);
  const agent = who?.type === 'agent' ? getAgentById(who.id) : null;
  if (agent) return <AgentAvatar agent={agent} size={size} />;
  if (who?.type === 'cli') return <CliMark cli={who.id} size="sm" />;
  if (who?.type === 'person') return <PersonBadge name={card.assigneeName} size={size} />;
  return <span className="hb-sc-nobody"><Icon.ArrowAssign size={11} /></span>;
}

/** The "who does this card" picker: the same people, agents and coding agents as a to-do. */
export function AssignChip({ card, onAssign, showName = false }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  const name = assigneeWords(card);
  return (
    <>
      <button ref={ref} type="button" className="hb-sc-assign" title={name ? `For ${name}. Pick someone else` : 'Pick who does this card'}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}>
        <AssigneeFace card={card} />
        {showName && <span>{name ? `For ${name}` : 'Pick who does it'}</span>}
      </button>
      {open && (
        <TodoAssignMenu
          anchorRef={ref}
          agents={Array.isArray(getAgents()) ? getAgents() : []}
          onAssign={(value, who) => { onAssign(value, who); setOpen(false); }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
