import React from 'react';
import { Icon } from '../Icons.jsx';
import { AgentAvatar } from '../Agents.jsx';
import { getAgents, getAgentById } from '../../lib/agentStore.js';
import { TodoAssignMenu } from './TodoAssignMenu.jsx';

const STATUS_CONFIG = {
  needs_contract: { label: 'needs contract', bg: 'var(--ps-orange)', color: '#fff' },
  queued:         { label: 'queued',          bg: 'var(--accent-soft)', color: 'var(--accent-ink)' },
  dispatched:     { label: 'dispatched',      bg: 'oklch(0.55 0.15 280)', color: '#fff' },
  pr_open:        { label: 'PR',             bg: 'oklch(0.55 0.18 310)', color: '#fff' },
  blocked:        { label: 'blocked',         bg: 'var(--ps-red)', color: '#fff' },
  failed:         { label: 'failed',          bg: 'var(--ps-red)', color: '#fff' },
  merged:         { label: 'merged ✓',        bg: 'var(--ps-green)', color: '#fff' },
  pulled:         { label: 'landed ✓',        bg: 'oklch(0.65 0.19 145)', color: '#fff' },
};

const CONTRACT_HINT = `Add these lines to your todo:\nFiles: src/components/MyWindow.jsx\nAcceptance: npm test -- tests/myWindow.test.jsx`;

function StatusBadge({ status, prUrl, prNumber, contractMissing, handoffWarning }) {
  const config = STATUS_CONFIG[status];
  if (!config) return null;

  const label = status === 'pr_open' && prNumber ? `PR #${prNumber}` : config.label;
  const title = status === 'needs_contract'
    ? (handoffWarning || (contractMissing ? `Missing: ${contractMissing}\n\n${CONTRACT_HINT}` : CONTRACT_HINT))
    : status === 'blocked' ? (handoffWarning || 'Blocked — check the operations board')
    : status === 'failed' ? (handoffWarning || 'Task failed — check the operations board')
    : null;

  const badge = (
    <span
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        fontSize: 9.5, fontWeight: 600, letterSpacing: '0.02em',
        padding: '2px 7px', borderRadius: 20,
        background: config.bg, color: config.color,
        whiteSpace: 'nowrap', lineHeight: 1.4,
        cursor: prUrl ? 'pointer' : title ? 'help' : 'default',
        textDecoration: 'none',
      }}
    >
      {label}
    </span>
  );

  if (prUrl) {
    return <a href={prUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>{badge}</a>;
  }
  return badge;
}

export function TodoRow({ item, canHandoff, editingId, editText, onToggle, onAssign, onHandoff, onStartEdit, onSaveEdit, onCancelEdit, onEditChange }) {
  const agents = Array.isArray(getAgents()) ? getAgents() : [];
  const agent = item.assignee ? getAgentById(item.assignee) : null;
  const [showAssign, setShowAssign] = React.useState(false);
  const assignButtonRef = React.useRef(null);
  const isSent = Boolean(item.handoffPath || item.handoffTaskId || item.handedOffAt);
  const isEditing = editingId === item.id;
  const implementationStatus = item.implementationStatus || (isSent ? 'dispatched' : null);
  const contractMissing = Array.isArray(item.contractMissing) ? item.contractMissing.join(', ') : '';
  
  const handleDoubleClick = () => {
    if (!isSent) {
      onStartEdit(item.id, item.text);
    }
  };
  
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      onSaveEdit();
    } else if (e.key === 'Escape') {
      onCancelEdit();
    }
  };
  
  return (
    <div onDoubleClick={handleDoubleClick} style={{ display: 'grid', gridTemplateColumns: '16px minmax(0, 1fr) auto auto', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, background: item.done ? 'rgba(46, 204, 113, 0.08)' : 'var(--surface-2)', border: '1px solid ' + (item.done ? 'var(--ps-green)' : 'var(--hairline)'), position: 'relative', transition: 'all 0.2s ease', cursor: isSent ? 'default' : 'pointer' }}>
      <button onClick={(e) => { e.stopPropagation(); onToggle(); }} style={{ all: 'unset', cursor: 'pointer', width: 16, height: 16, borderRadius: 5, background: item.done ? 'var(--ps-green)' : 'transparent', boxShadow: 'inset 0 0 0 1.5px ' + (item.done ? 'transparent' : 'var(--hairline-strong)'), display: 'grid', placeItems: 'center', color: 'white', flexShrink: 0, transition: 'all 0.2s ease' }}>
        {item.done && <Icon.Check size={10} stroke={2.6}/>}
      </button>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {isEditing ? (
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              autoFocus
              value={editText}
              onChange={(e) => onEditChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={onSaveEdit}
              onClick={(e) => e.stopPropagation()}
              style={{ flex: 1, padding: '2px 6px', fontSize: 13.5, border: '1px solid var(--accent)', borderRadius: 4, outline: 'none', background: 'var(--surface)', color: 'var(--ink)' }}
            />
          </div>
        ) : (
          <span title={isSent ? 'Sent items cannot be edited' : 'Double-click to edit'} style={{ fontSize: 13.5, color: item.done ? 'var(--ink-faint)' : 'var(--ink)', textDecoration: item.done ? 'line-through' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.text}</span>
        )}
        {implementationStatus && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, minHeight: 16 }}>
            <StatusBadge
              status={implementationStatus}
              prUrl={item.prUrl}
              prNumber={item.prNumber}
              contractMissing={contractMissing}
              handoffWarning={item.handoffWarning}
            />
            {item.handoffPath && !item.prUrl && implementationStatus !== 'needs_contract' && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }} title={item.handoffPath}>
                {item.handoffPath.split('/').pop()}
              </span>
            )}
          </div>
        )}
      </div>
      <button ref={assignButtonRef} onClick={(e) => { e.stopPropagation(); setShowAssign(s => !s); }} title={agent ? `Assigned to ${agent.name}` : 'Assign to agent'} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
        {agent ? <AgentAvatar agent={agent} size={20} /> : <div style={{ width: 20, height: 20, borderRadius: '50%', border: '1px dashed var(--hairline-strong)', display: 'grid', placeItems: 'center', color: 'var(--ink-faint)' }}><Icon.ArrowAssign size={11}/></div>}
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onHandoff(); }}
        disabled={!canHandoff || !item.assignee || item.handingOff}
        title={
          !canHandoff ? 'Open a local project first'
          : !item.assignee ? 'Assign to an agent first'
          : 'Create project handoff'
        }
        style={{ all: 'unset', cursor: canHandoff && item.assignee && !item.handingOff ? 'pointer' : 'not-allowed', width: 24, height: 24, borderRadius: 7, display: 'grid', placeItems: 'center', background: item.handoffPath ? 'var(--accent-soft)' : 'var(--surface)', border: '1px solid var(--hairline)', color: item.handoffPath ? 'var(--accent-ink)' : 'var(--ink-faint)', opacity: canHandoff && item.assignee ? 1 : 0.45 }}
      >
        {item.handingOff ? '...' : <Icon.ArrowAssign size={12} />}
      </button>
      {showAssign && (
        <TodoAssignMenu
          anchorRef={assignButtonRef}
          agents={agents}
          onAssign={(agentId) => { onAssign(agentId); setShowAssign(false); }}
          onClose={() => setShowAssign(false)}
        />
      )}
    </div>
  );
}
