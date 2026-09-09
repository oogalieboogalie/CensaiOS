import React from 'react';
import { createPortal } from 'react-dom';
import { AgentAvatar } from '../Agents.jsx';

function getMenuPosition(anchorEl) {
  const rect = anchorEl.getBoundingClientRect();
  const width = 180;
  const maxHeight = Math.min(360, window.innerHeight - 24);
  const spaceBelow = window.innerHeight - rect.bottom;
  const openUp = spaceBelow < 260 && rect.top > spaceBelow;
  const top = openUp
    ? Math.max(12, rect.top - maxHeight - 8)
    : Math.min(window.innerHeight - 12 - maxHeight, rect.bottom + 8);
  const left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.right - width));
  return { top, left, width, maxHeight };
}

export function TodoAssignMenu({ anchorRef, agents, onAssign, onClose }) {
  const [position, setPosition] = React.useState(null);

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
          borderRadius: 12,
          padding: 6,
          boxShadow: 'var(--shadow-pop)',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '4px 8px' }}>Assign to</div>
        <AssignOption onClick={() => onAssign(null)}>Unassigned</AssignOption>
        {agents.map(agent => (
          <AssignOption key={agent.id} agent={agent} onClick={() => onAssign(agent.id)} />
        ))}
      </div>
    </>,
    document.body
  );
}

function AssignOption({ agent, children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        all: 'unset',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        borderRadius: 6,
        color: agent ? 'var(--ink)' : 'var(--ink-soft)',
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-2)'}
      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
    >
      {agent ? (
        <>
          <AgentAvatar agent={agent} size={20} />
          <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 500 }}>{agent.name}</span>
            <span style={{ fontSize: 10, color: 'var(--ink-faint)' }}>{agent.role}</span>
          </span>
        </>
      ) : children}
    </button>
  );
}
