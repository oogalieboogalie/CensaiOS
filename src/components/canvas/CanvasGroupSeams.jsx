import React from 'react';
import { solveLayout } from '../../lib/layout/infer.js';

// Hit area around a seam, in screen px; the seam itself is the group gap.
const SEAM_HIT_PX = 10;

/**
 * Split dividers between tiles. Dragging one moves the shared edge: both
 * neighbors resize in a single update and stop at the minimum window size.
 */
export function CanvasGroupSeams({ group, zoom, onSetSeam }) {
  const solved = React.useMemo(
    () => solveLayout(group.root, { x: group.x, y: group.y, w: group.w, h: group.h }, { snapBounds: false }),
    [group.root, group.x, group.y, group.w, group.h],
  );
  const [active, setActive] = React.useState(null);
  const dragRef = React.useRef(null);
  const hit = SEAM_HIT_PX / zoom;
  const line = 2 / zoom;

  return solved.splits.map((split) => {
    const vertical = split.axis === 'vertical';
    const { seam } = split;
    const box = vertical
      ? { left: seam.x + seam.w / 2 - hit / 2 - group.x, top: seam.y - group.y, width: hit, height: seam.h }
      : { left: seam.x - group.x, top: seam.y + seam.h / 2 - hit / 2 - group.y, width: seam.w, height: hit };
    const on = active === split.path;
    return (
      <div
        key={split.path || 'root'}
        data-group-seam={split.path || 'root'}
        role="separator"
        aria-orientation={vertical ? 'vertical' : 'horizontal'}
        onPointerEnter={() => setActive(split.path)}
        onPointerLeave={() => { if (!dragRef.current) setActive(null); }}
        onPointerDown={(e) => {
          if (e.button) return;
          e.stopPropagation();
          try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
          dragRef.current = { id: e.pointerId, start: vertical ? e.clientX : e.clientY, split };
          setActive(split.path);
        }}
        onPointerMove={(e) => {
          const d = dragRef.current;
          if (!d || d.id !== e.pointerId) return;
          e.stopPropagation();
          const delta = ((vertical ? e.clientX : e.clientY) - d.start) / zoom;
          if (!Number.isFinite(delta)) return;
          const { firstSize, available, minFirst, minSecond } = d.split;
          const size = Math.max(minFirst, Math.min(available - minSecond, firstSize + delta));
          onSetSeam?.(d.split.path, size / Math.max(1, available));
        }}
        onPointerUp={(e) => {
          if (!dragRef.current || dragRef.current.id !== e.pointerId) return;
          e.stopPropagation();
          try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
          dragRef.current = null;
          setActive(null);
        }}
        onPointerCancel={() => { dragRef.current = null; setActive(null); }}
        style={{
          position: 'absolute', ...box,
          cursor: vertical ? 'col-resize' : 'row-resize',
          pointerEvents: 'auto',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <span aria-hidden="true" style={{
          width: vertical ? line : '100%', height: vertical ? '100%' : line,
          background: 'var(--accent)', opacity: on ? 1 : 0,
          transition: 'opacity var(--dur-fast, 120ms) var(--ease-standard)',
        }} />
      </div>
    );
  });
}
