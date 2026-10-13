import React from 'react';
import { useCommentStore } from '../../lib/comments/commentStore.js';
import { screenToCanvas } from '../../lib/canvasMath.js';

/** Topmost window under a board point, if any. */
export function windowAtPoint(wins, point) {
  const hits = wins.filter((win) => !win.minimized
    && point.x >= win.x && point.x <= win.x + win.w
    && point.y >= win.y && point.y <= win.y + win.h);
  hits.sort((a, b) => (Number(b.zIndex) || 0) - (Number(a.zIndex) || 0));
  return hits[0] || null;
}

/**
 * While the comment tool is on, a click anywhere on the board drops a draft
 * pin there (attached to the window under the cursor, so it moves with it).
 */
export function CommentPlacer({ wins, pan, zoom }) {
  const tool = useCommentStore((state) => state.tool);
  const setDraft = useCommentStore((state) => state.setDraft);
  const setTool = useCommentStore((state) => state.setTool);
  React.useEffect(() => {
    if (!tool) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') setTool(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tool, setTool]);
  if (!tool) return null;
  const place = (event) => {
    const surface = document.querySelector('[data-canvas-overlay]')?.parentElement;
    const rect = surface?.getBoundingClientRect() || { left: 0, top: 0 };
    const point = screenToCanvas(event.clientX, event.clientY, pan.x, pan.y, zoom, rect);
    const win = windowAtPoint(wins, point);
    setDraft(win
      ? { windowId: win.id, windowTitle: win.title || win.kind, x: point.x - win.x, y: point.y - win.y }
      : { x: point.x, y: point.y });
  };
  return (
    <div
      data-testid="comment-placer"
      onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
      onClick={place}
      style={{ position: 'fixed', inset: 0, zIndex: 390, cursor: 'crosshair', background: 'transparent' }}
    />
  );
}
