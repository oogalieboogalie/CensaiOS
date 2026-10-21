import React from 'react';
import { createPortal } from 'react-dom';
import { AgentAvatar } from '../Agents.jsx';
import { CliMark } from '../agentConsole/CliMark.jsx';
import '../agentConsole/agentConsole.css';
import { useCliRoster } from '../agentConsole/useCliRoster.js';
import { CODING_AGENTS, codingAgentAssignee, personAssignee } from '../../lib/todos/assignees.js';
import { PersonBadge } from './PersonBadge.jsx';
import { codingAgentChoice, logUnreadyAssign } from './codingAgentChoice.js';
import { useMe } from './useMe.js';

function getMenuPosition(anchorEl) {
  const rect = anchorEl.getBoundingClientRect();
  const width = 220;
  const maxHeight = Math.min(440, window.innerHeight - 24);
  const spaceBelow = window.innerHeight - rect.bottom;
  const openUp = spaceBelow < 260 && rect.top > spaceBelow;
  const top = openUp
    ? Math.max(12, rect.top - maxHeight - 8)
    : Math.min(window.innerHeight - 12 - maxHeight, rect.bottom + 8);
  const left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.right - width));
  return { top, left, width, maxHeight };
}

const headingStyle = { fontFamily: 'var(--font-label)', fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', letterSpacing: 'var(--label-tracking)', textTransform: 'var(--label-case)', padding: '4px 8px' };

const selectRoster = (state) => ({ clis: state.clis, loaded: state.loaded, unavailable: state.unavailable });

/**
 * Assign menu for one to-do: you, nobody, the board's agents, and the coding
 * agents installed on this computer (the Agent Console's roster; the rest are
 * greyed with why). `onAssign(value, name)` gets the assignee
 * value (see src/lib/todos/assignees.js) and a display name.
 */
export function TodoAssignMenu({ anchorRef, agents, onAssign, onClose }) {
  const me = useMe();
  const [position, setPosition] = React.useState(null);
  const roster = useCliRoster(selectRoster);

  React.useLayoutEffect(() => {
    const update = () => {
      if (anchorRef.current) setPosition(getMenuPosition(anchorRef.current));
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [anchorRef]);

  if (!position) return null;

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 999 }} />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: position.top,
          left: position.left,
          zIndex: 1000,
          width: position.width,
          maxHeight: position.maxHeight,
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          background: 'var(--surface)',
          border: '1px solid var(--hairline)',
          borderRadius: 'var(--radius-xl)',
          padding: 6,
          boxShadow: 'var(--shadow-pop)',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <div style={headingStyle}>Assign to</div>
        {me && (
          <AssignOption onClick={() => onAssign(personAssignee(me.id), me.name)} data-assign="me">
            <PersonBadge name={me.name} size={20} />
            <OptionText title="Me" note="Reminds you in the bottom bar" />
          </AssignOption>
        )}
        <AssignOption onClick={() => onAssign(null, null)}><span style={{ color: 'var(--ink-soft)', fontSize: 'var(--text-sm)' }}>Unassigned</span></AssignOption>
        {agents.length > 0 && <div style={headingStyle}>Board agents</div>}
        {agents.map(agent => (
          <AssignOption key={agent.id} onClick={() => onAssign(agent.id, agent.name)}>
            <AgentAvatar agent={agent} size={20} />
            <OptionText title={agent.name} note={agent.role} />
          </AssignOption>
        ))}
        <div style={headingStyle}>Coding agents</div>
        {CODING_AGENTS.map(({ id, label }) => {
          const choice = codingAgentChoice(roster.clis.find(c => c.id === id), roster);
          const pick = () => { logUnreadyAssign(label, choice); onAssign(codingAgentAssignee(id), label); };
          return (
            <AssignOption key={id} onClick={pick} disabled={!choice.offered} data-assign={`cli-${id}`}>
              <CliMark cli={id} size="sm" />
              <OptionText title={label} note={choice.note} />
            </AssignOption>
          );
        })}
      </div>
    </>,
    document.body
  );
}

function OptionText({ title, note }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>{title}</span>
      {note ? <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)' }}>{note}</span> : null}
    </span>
  );
}

function AssignOption({ children, onClick, disabled = false, ...rest }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled}
      onClick={onClick}
      style={{
        all: 'unset',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        borderRadius: 'var(--radius-md)',
        color: 'var(--ink)',
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = 'var(--surface-2)'; }}
      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
    >
      {children}
    </button>
  );
}
