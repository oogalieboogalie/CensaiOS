import React from 'react';
import { useWorkspaceStore } from '../lib/store.js';
import { filterForGroupFocus } from '../lib/groupHotkeys.js';

// Full-screen group focus (F1..F9). The canvas only renders the focused
// group; the rest of the app chrome hides as in focus mode. This bar is the
// visible way out besides Escape.
export function useGroupFocusView(wins, canvasGroups) {
  const groupFocus = useWorkspaceStore((state) => state.groupFocus);
  const view = React.useMemo(
    () => filterForGroupFocus(wins, canvasGroups, groupFocus),
    [wins, canvasGroups, groupFocus]
  );
  return { ...view, active: Boolean(groupFocus) };
}

export function GroupFocusBar() {
  const label = useWorkspaceStore((state) => {
    if (!state.groupFocus) return null;
    const group = state.canvasGroups.find((g) => g.id === state.groupFocus.groupId);
    return group ? (group.label || 'Group') : null;
  });
  const exitGroupFocus = useWorkspaceStore((state) => state.exitGroupFocus);
  if (!label) return null;
  return (
    <div
      role="status"
      data-testid="group-focus-bar"
      style={{
        position: 'fixed', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 200,
        display: 'flex', alignItems: 'center', gap: 10, padding: '4px 6px 4px 12px',
        borderRadius: 'var(--radius-full)', background: 'var(--surface)', border: '1px solid var(--hairline)',
        boxShadow: 'var(--shadow-card)', font: '12px var(--font-ui, inherit)', color: 'var(--ink)',
      }}
    >
      <span style={{ fontWeight: 600 }}>{label}</span>
      <button
        type="button"
        onClick={() => exitGroupFocus()}
        title="Leave full-screen group view (Esc)"
        style={{
          all: 'unset', cursor: 'pointer', padding: '2px 8px', borderRadius: 'var(--radius-full)',
          background: 'var(--surface-2)', color: 'var(--ink-faint)', fontSize: 'var(--text-xs)',
        }}
      >
        Exit <kbd style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>Esc</kbd>
      </button>
    </div>
  );
}
