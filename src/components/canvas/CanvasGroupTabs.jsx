import React from 'react';
import { solveLayout } from '../../lib/layout/infer.js';
import { TAB_STRIP_HEIGHT } from '../../lib/layout/constants.js';
import { outerCorners } from '../../lib/layout/tree.js';
import { WINDOW_MANIFEST_BY_KIND } from '../../lib/windowManifest.js';

const DRAG_OUT_PX = 8;

function tabTitle(win) {
  if (!win) return 'Window';
  return win.title || WINDOW_MANIFEST_BY_KIND[win.kind]?.label || win.kind || 'Window';
}

/**
 * Tab strips for slots that hold more than one window. Click a tab to show
 * it; drag a tab away to pull that window out of the group.
 */
export function CanvasGroupTabs({ group, zoom, allWins = [], onShowTab, onUndockTab }) {
  const solved = React.useMemo(
    () => solveLayout(group.root, { x: group.x, y: group.y, w: group.w, h: group.h }, { snapBounds: false }),
    [group.root, group.x, group.y, group.w, group.h],
  );
  const dragRef = React.useRef(null);
  const byId = React.useMemo(() => new Map(allWins.map((w) => [w.id, w])), [allWins]);
  const outer = { x: group.x, y: group.y, w: group.w, h: group.h };

  return solved.slots.filter((slot) => slot.stack.length > 1).map((slot) => {
    const c = outerCorners(slot.rect, outer);
    const r = (on) => (on ? 'var(--window-radius, var(--radius-window))' : '0');
    return (
      <div
        key={slot.path || 'root'}
        data-group-tabs={slot.path || 'root'}
        role="tablist"
        style={{
          position: 'absolute',
          left: slot.rect.x - group.x, top: slot.rect.y - group.y,
          width: slot.rect.w, height: TAB_STRIP_HEIGHT,
          display: 'flex', alignItems: 'stretch', gap: 1,
          background: 'var(--surface-2)',
          borderBottom: '1px solid var(--hairline)',
          borderRadius: `${r(c.tl)} ${r(c.tr)} 0 0`,
          overflow: 'hidden', pointerEvents: 'auto', boxSizing: 'border-box',
        }}
      >
        {slot.stack.map((id) => {
          const active = id === slot.activeId;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={active}
              title={tabTitle(byId.get(id))}
              onPointerDown={(e) => {
                e.stopPropagation();
                try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
                dragRef.current = { id: e.pointerId, winId: id, x: e.clientX, y: e.clientY };
              }}
              onPointerUp={(e) => {
                const d = dragRef.current;
                dragRef.current = null;
                if (!d || d.id !== e.pointerId) return;
                e.stopPropagation();
                const dx = e.clientX - d.x;
                const dy = e.clientY - d.y;
                if (Math.hypot(dx, dy) > DRAG_OUT_PX) onUndockTab?.(d.winId, { dx: dx / zoom, dy: dy / zoom });
                else onShowTab?.(d.winId);
              }}
              style={{
                all: 'unset', boxSizing: 'border-box', cursor: 'pointer',
                flex: '0 1 160px', minWidth: 48, padding: '0 10px',
                display: 'flex', alignItems: 'center',
                fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)',
                color: active ? 'var(--ink)' : 'var(--ink-faint)',
                background: active ? 'var(--surface)' : 'transparent',
                boxShadow: active ? 'inset 0 -2px 0 var(--accent)' : 'none',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{tabTitle(byId.get(id))}</span>
            </button>
          );
        })}
      </div>
    );
  });
}
