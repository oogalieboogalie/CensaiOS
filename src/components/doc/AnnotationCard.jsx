import React from 'react';
import { Icon } from '../Icons.jsx';
import { AgentAvatar } from '../Agents.jsx';
import { getAgentById } from '../../lib/agentStore.js';
import { kindVars } from './DocData.js';

// One comment beside the page: a raised card that lifts under the pointer.
// Its kind's colours reach docWindow.css as variables (kindVars).
export function AnnotationCard({ ann, isActive, onClick, onRemove }) {
  const agent = ann.agentId ? getAgentById(ann.agentId) : null;
  return (
    <div onClick={onClick} className="hb-panel hb-lift doc-note" data-kind={ann.kind} data-active={isActive ? 'true' : undefined} style={kindVars(ann.kind)}>
      <div className="doc-note-head">
        {agent ? <AgentAvatar agent={agent} size={16} /> : <div className="doc-note-dot">·</div>}
        <span className="doc-note-author">{ann.author}</span>
        <span className="doc-kind">{ann.kind}</span>
        <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(); }} title="Remove" className="doc-x"><Icon.Close size={10}/></button>
      </div>
      <div className="doc-quote">"{ann.quote.length > 80 ? ann.quote.slice(0, 80) + '…' : ann.quote}"</div>
      {ann.body && <div className="doc-note-body">{ann.body}</div>}
      {ann.lost && <div data-note-lost className="doc-note-lost">Its words were deleted from the page.</div>}
    </div>
  );
}
