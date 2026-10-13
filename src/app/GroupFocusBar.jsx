import React from 'react';
import { useWorkspaceStore } from '../lib/store.js';
import { filterForGroupFocus } from '../lib/groupHotkeys.js';
import { usePresentStore } from '../lib/presentStore.js';

// Full-screen group focus (F1..F9). The canvas only renders the focused
// group; the rest of the app chrome hides as in focus mode. This bar is the
// visible way out besides Escape
// (Shift+Escape while a window holds the keyboard) and the same F-key.
// Present mode (src/app/present/) hides the chrome too and draws its own
// progress line instead of this bar.
export function useGroupFocusView(wins, canvasGroups) {
  const groupFocus = useWorkspaceStore((state) => state.groupFocus);
  const presenting = usePresentStore((state) => state.presenting);
  const view = React.useMemo(
    () => filterForGroupFocus(wins, canvasGroups, groupFocus),
    [wins, canvasGroups, groupFocus]
  );
  return { ...view, active: Boolean(groupFocus) || presenting };
}

export function GroupFocusBar() {
  const label = useWorkspaceStore((state) => {
    if (!state.groupFocus) return null;
    const group = state.canvasGroups.find((g) => g.id === state.groupFocus.groupId);
    return group ? (group.label || 'Group') : null;
  });
  const slot = useWorkspaceStore((state) => state.groupFocus?.slot || null);
  const exitGroupFocus = useWorkspaceStore((state) => state.exitGroupFocus);
  const presenting = usePresentStore((state) => state.presenting);
  if (!label || presenting) return null;
  return (
    <div
      role="status"
      data-testid="group-focus-bar"
      className="hb-glass"
      style={{
        position: 'fixed', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 200,
        display: 'flex', alignItems: 'center', gap: 10, padding: '4px 6px 4px 12px',
        borderRadius: 'var(--radius-full)', border: '1px solid var(--glass-line)',
        font: '12px var(--font-ui, inherit)', color: 'var(--ink)',
      }}
    >
      {slot && <span className="hb-kbd" title={`Press F${slot} again to go back`}>F{slot}</span>}
      <span style={{ fontWeight: 600 }}>{label}</span>
      <button
        type="button"
        onClick={() => exitGroupFocus()}
        title="Leave full-screen group view (Esc, or Shift+Esc while typing)"
        style={{
          all: 'unset', cursor: 'pointer', padding: '2px 8px', borderRadius: 'var(--radius-full)',
          background: 'var(--surface-2)', color: 'var(--ink-faint)', fontSize: 'var(--text-xs)',
        }}
      >
        Exit <span className="hb-kbd">Esc</span>
      </button>
    </div>
  );
}
