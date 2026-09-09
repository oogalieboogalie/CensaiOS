import React from 'react';
import { Icon } from './Icons.jsx';
import { WindowTitle } from './Windows.jsx';
import { useTodos } from './todos/useTodos.js';
import { TodoRow } from './todos/TodoRow.jsx';

const ChevronIcon = ({ expanded }) => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{
      transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
      transition: 'transform 0.2s ease',
      color: 'var(--ink-faint)',
    }}
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

export function TodosWindow({ win, onUpdate, currentProject }) {
  const {
    items,
    newText, setNewText,
    handoffError,
    editingId, editText, setEditText,
    completedCount, totalCount,
    toggle, assign, add, startEdit, saveEdit, cancelEdit, handoff
  } = useTodos(win, onUpdate, currentProject);

  const [animatingIds, setAnimatingIds] = React.useState({});
  const [completedExpanded, setCompletedExpanded] = React.useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(media.matches);
    const listener = (e) => setPrefersReducedMotion(e.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  const handleToggle = (id) => {
    const item = items.find(it => it.id === id);
    if (!item) return;

    const hasMatchMedia = typeof window !== 'undefined' && typeof window.matchMedia === 'function';
    const reducedMotion = hasMatchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reducedMotion) {
      toggle(id);
      return;
    }

    if (!item.done) {
      // Transitioning from active to completed (animating out from active list)
      setAnimatingIds(prev => ({ ...prev, [id]: 'completing' }));
      setTimeout(() => {
        toggle(id);
        setAnimatingIds(prev => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }, 250);
    } else {
      // Transitioning from completed to active (animating into active list)
      setAnimatingIds(prev => ({ ...prev, [id]: 'activating' }));
      toggle(id);
      setTimeout(() => {
        setAnimatingIds(prev => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }, 250);
    }
  };

  const activeItems = items.filter(it => !it.done || animatingIds[it.id] === 'completing');
  const completedItems = items.filter(it => it.done && animatingIds[it.id] !== 'completing');

  return (
    <>
      <style>{`
        @keyframes todo-expand {
          from {
            grid-template-rows: 0fr;
            opacity: 0;
            margin-bottom: 0;
          }
          to {
            grid-template-rows: 1fr;
            opacity: 1;
            margin-bottom: 6px;
          }
        }
      `}</style>
      <WindowTitle accent="var(--ps-green)" icon={<Icon.Folder size={14}/>} label={win.title || 'Project To-Dos'} subtitle={win.subtitle || 'Newsletter / weekly'} attachedAgentIds={win.attachedAgents} onDetach={(id) => onUpdate({ attachedAgents: (win.attachedAgents || []).filter(a => a !== id) })} />
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 12, background: 'var(--surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '8px 12px', background: completedCount > 0 ? 'var(--ps-green)' : 'var(--surface-2)', borderRadius: 8, color: completedCount > 0 ? 'white' : 'var(--ink-faint)', fontSize: 12, fontWeight: 500, transition: 'background 0.3s ease' }}>
          <Icon.Check size={14} stroke={2.5} />
          <span>{completedCount} task{completedCount !== 1 ? 's' : ''} completed</span>
          {totalCount > 0 && <span style={{ marginLeft: 'auto', opacity: 0.7, fontSize: 11 }}>({completedCount}/{totalCount})</span>}
        </div>
        {!currentProject?.path && <div style={{ marginBottom: 8, color: 'var(--ps-red)', fontSize: 11, lineHeight: 1.4 }}>Open a local project before handing off todos.</div>}
        {handoffError && <div style={{ marginBottom: 8, color: 'var(--ps-red)', fontSize: 11, lineHeight: 1.4 }}>{handoffError}</div>}

        {/* Active Tasks List */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {activeItems.map(it => {
            const isAnimatingOut = animatingIds[it.id] === 'completing';
            const isAnimatingIn = animatingIds[it.id] === 'activating';
            return (
              <div
                key={it.id}
                style={{
                  display: 'grid',
                  gridTemplateRows: isAnimatingOut ? '0fr' : '1fr',
                  opacity: isAnimatingOut ? 0 : 1,
                  marginBottom: isAnimatingOut ? 0 : 6,
                  transition: prefersReducedMotion
                    ? 'none'
                    : 'grid-template-rows 250ms cubic-bezier(0.4, 0, 0.2, 1), opacity 250ms ease, margin-bottom 250ms cubic-bezier(0.4, 0, 0.2, 1)',
                  animation: !prefersReducedMotion && isAnimatingIn ? 'todo-expand 250ms cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
                  overflow: 'hidden',
                }}
              >
                <div style={{ minHeight: 0 }}>
                  <TodoRow
                    item={{ ...it, done: it.done || isAnimatingOut }}
                    canHandoff={Boolean(currentProject?.path)}
                    editingId={editingId}
                    editText={editText}
                    onToggle={() => handleToggle(it.id)}
                    onAssign={(aid) => assign(it.id, aid)}
                    onHandoff={() => handoff(it)}
                    onStartEdit={startEdit}
                    onSaveEdit={saveEdit}
                    onCancelEdit={cancelEdit}
                    onEditChange={setEditText}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Completed Tasks Collapsible Section */}
        {completedItems.length > 0 && (
          <div style={{ marginTop: 16, borderTop: '1px solid var(--hairline)', paddingTop: 12 }}>
            <button
              onClick={() => setCompletedExpanded(prev => !prev)}
              style={{
                all: 'unset',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--ink-soft)',
                padding: '4px 8px',
                borderRadius: 6,
                background: 'var(--surface-2)',
                border: '1px solid var(--hairline)',
                transition: 'background 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-3)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--surface-2)'}
            >
              <ChevronIcon expanded={completedExpanded} />
              <span>Completed Tasks ({completedItems.length})</span>
            </button>

            {completedExpanded && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                {completedItems.map(it => (
                  <div key={it.id}>
                    <TodoRow
                      item={it}
                      canHandoff={Boolean(currentProject?.path)}
                      editingId={editingId}
                      editText={editText}
                      onToggle={() => handleToggle(it.id)}
                      onAssign={(aid) => assign(it.id, aid)}
                      onHandoff={() => handoff(it)}
                      onStartEdit={startEdit}
                      onSaveEdit={saveEdit}
                      onCancelEdit={cancelEdit}
                      onEditChange={setEditText}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
          <Icon.Plus size={14} style={{ color: 'var(--ink-faint)' }} />
          <input data-mission="todo-input" value={newText} onChange={(e) => setNewText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} placeholder="add a to-do"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: 'var(--ink)', padding: '4px 0' }} />
        </div>
      </div>
    </>
  );
}
