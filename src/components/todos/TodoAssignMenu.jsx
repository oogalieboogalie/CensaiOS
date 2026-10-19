import React from 'react';
import { createPortal } from 'react-dom';
import { AgentAvatar } from '../Agents.jsx';
import { CliMark } from '../agentConsole/CliMark.jsx';
import '../agentConsole/agentConsole.css';
import { useCliRoster } from '../agentConsole/useCliRoster.js';
import { CODING_AGENTS, codingAgentAssignee, personAssignee } from '../../lib/todos/assignees.js';
import { PersonBadge } from './PersonBadge.jsx';
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

function codingAgentNote(cli) {
  if (!cli) return 'Runs on the computer with censaiOS';
  if (cli.state === 'installing') return 'Installing';
  if (!cli.installed) return 'Not installed yet';
  return cli.running ? 'Working on something' : 'Ready';
}

const selectClis = (state) => state.clis;

/**
 * Assign menu for one to-do: you, nobody, the board's agents, and the coding
 * agents from the Agent Console. `onAssign(value, name)` gets the assignee
 * value (see src/lib/todos/assignees.js) and a display name.
 */
export function TodoAssignMenu({ anchorRef, agents, onAssign, onClose }) {
  const me = useMe();
  const [position, setPosition] = React.useState(null);
  const roster = useCliRoster(selectClis);

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
          const cli = roster.find(c => c.id === id);
          return (
            <AssignOption key={id} onClick={() => onAssign(codingAgentAssignee(id), label)} data-assign={`cli-${id}`}>
              <CliMark cli={id} size="sm" />
              <OptionText title={label} note={codingAgentNote(cli)} />
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

function AssignOption({ children, onClick, ...rest }) {
  return (
    <button
      type="button"
      {...rest}
      onClick={onClick}
      style={{
        all: 'unset',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        borderRadius: 'var(--radius-md)',
        color: 'var(--ink)',
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-2)'}
      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
    >
      {children}
    </button>
  );
}
