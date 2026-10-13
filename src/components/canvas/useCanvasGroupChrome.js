import React from 'react';

// Screen px above a group where its floating label sits; hovering there
// keeps the label up.
const LABEL_REACH_PX = 40;

/**
 * Canvas-side state for tiled groups: which group the pointer is over (its
 * label shows), dragging a tile's header to move the whole group, and
 * dragging a tab out of a stacked slot.
 */
export function useCanvasGroupChrome({ wins, canvasGroups, activeId, selectedIds, zoom, onMoveGroup, handleGroupDragEnd, onUndockWindow, onUpdate }) {
  const [hoveredGroupId, setHoveredGroupId] = React.useState(null);
  const trackHover = React.useCallback((point) => {
    const reach = LABEL_REACH_PX / (zoom || 1);
    const over = canvasGroups
      .filter((g) => point.x >= g.x && point.x <= g.x + g.w && point.y >= g.y - reach && point.y <= g.y + g.h)
      .sort((a, b) => a.w * a.h - b.w * b.h)[0];
    const nextId = over ? over.id : null;
    setHoveredGroupId((prev) => (prev === nextId ? prev : nextId));
  }, [canvasGroups, zoom]);

  // The label also stays up for the group holding the focused or selected window.
  const visibleGroupIds = React.useMemo(() => {
    const ids = new Set(hoveredGroupId ? [hoveredGroupId] : []);
    const focus = new Set([activeId, ...selectedIds].filter(Boolean));
    for (const w of wins) if (w.groupId && focus.has(w.id)) ids.add(w.groupId);
    return ids;
  }, [hoveredGroupId, activeId, selectedIds, wins]);

  // Stable so the memoized window frames don't re-render on every canvas render.
  const handlers = React.useRef({});
  handlers.current = { onMoveGroup, handleGroupDragEnd };
  const hasMove = !!onMoveGroup;
  const groupDrag = React.useMemo(() => (hasMove ? {
    move: (groupId, dx, dy, first) => handlers.current.onMoveGroup?.(groupId, dx, dy, first),
    end: (groupId) => handlers.current.handleGroupDragEnd?.(groupId),
  } : null), [hasMove]);

  const handleUndockTab = React.useCallback((winId, { dx, dy }) => {
    const win = wins.find((w) => w.id === winId);
    if (!win || !onUndockWindow) return;
    onUndockWindow(winId);
    onUpdate(winId, { x: win.x + dx, y: win.y + dy });
  }, [wins, onUndockWindow, onUpdate]);

  return { trackHover, visibleGroupIds, groupDrag, handleUndockTab };
}
