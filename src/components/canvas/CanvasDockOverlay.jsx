import React from 'react';
import { useDragState, dragState } from '../../lib/layout/dragState.js';
import {
  resolveDockTarget, applyDock, isDockAction, layoutBarGeometry, tiledMembers,
} from '../../lib/layout/dock.js';

const sameTarget = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);

/**
 * While a window is dragged: smart guides from edge snapping, the layout bar
 * on the window or group under the pointer, and a preview of exactly where
 * the window will land if dropped. The resolved target is written back to
 * dragState so the drop handler docks to what the person saw.
 */
export function CanvasDockOverlay({ wins, canvasGroups, zoom, enabled = true }) {
  const drag = useDragState();
  const winId = drag?.winId;
  const point = drag?.point;
  const free = !enabled || !!drag?.free;
  const previous = drag?.target || drag?.hover || null;

  const target = React.useMemo(() => {
    if (!winId || !point || free) return null;
    return resolveDockTarget({ point, draggedId: winId, wins, canvasGroups, zoom, previous });
    // `previous` only breaks ties between overlapping hosts; leaving it out
    // of deps avoids re-resolving on our own write-back.
  }, [winId, point?.x, point?.y, free, wins, canvasGroups, zoom]);

  React.useEffect(() => {
    if (!winId) return;
    const current = dragState.get();
    const action = isDockAction(target) ? target : null;
    const hover = target && !action ? target : null;
    if (!sameTarget(current?.target, action) || !sameTarget(current?.hover, hover)) {
      dragState.update({ target: action, hover });
    }
  }, [winId, target]);

  const preview = React.useMemo(() => {
    if (!winId || !isDockAction(target)) return null;
    const next = applyDock({ wins, canvasGroups }, winId, target, { makeGroup: () => ({ id: '__preview__', hue: 0 }) });
    return next?.wins.find((w) => w.id === winId) || null;
  }, [winId, target, wins, canvasGroups]);

  // The host whose layout bar is showing (group or loose window).
  const bar = React.useMemo(() => {
    if (!winId || !target) return null;
    let rect = null;
    let count = 2;
    if (target.groupId) {
      const group = canvasGroups.find((g) => g.id === target.groupId);
      const members = group && tiledMembers(group, wins)?.filter((w) => w.id !== winId);
      if (!members?.length) return null;
      rect = { x: group.x, y: group.y, w: group.w, h: group.h };
      count = members.length + 1;
    } else {
      const host = wins.find((w) => w.id === (target.hostId || target.targetId));
      if (!host) return null;
      rect = { x: host.x, y: host.y, w: host.w, h: host.h };
    }
    return layoutBarGeometry(rect, count, zoom);
  }, [winId, target, wins, canvasGroups, zoom]);

  if (!winId) return null;
  const s = 1 / (zoom || 1);
  const guides = !target ? (drag?.guides || []) : [];

  return (
    <div data-dock-overlay style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}>
      {guides.map((g, i) => (
        <div key={`g${i}`} data-snap-guide={g.axis} style={g.axis === 'x'
          ? { position: 'absolute', left: g.at - s / 2, top: g.from, width: s, height: g.to - g.from, background: 'var(--accent)' }
          : { position: 'absolute', left: g.from, top: g.at - s / 2, width: g.to - g.from, height: s, background: 'var(--accent)' }}
        />
      ))}
      {preview && (
        <div data-dock-preview style={{
          position: 'absolute', left: preview.x, top: preview.y, width: preview.w, height: preview.h,
          background: 'color-mix(in oklch, var(--accent) 14%, transparent)',
          border: `${2 * s}px solid var(--accent)`,
          borderRadius: 'var(--window-radius, var(--radius-window))',
          boxSizing: 'border-box',
          transition: 'left var(--dur-fast, 120ms) var(--ease-standard), top var(--dur-fast, 120ms) var(--ease-standard), width var(--dur-fast, 120ms) var(--ease-standard), height var(--dur-fast, 120ms) var(--ease-standard)',
        }} />
      )}
      {bar && (
        <div data-layout-bar style={{
          position: 'absolute', left: bar.bar.x, top: bar.bar.y, width: bar.bar.w, height: bar.bar.h,
          background: 'var(--surface)', border: `${s}px solid var(--hairline)`,
          borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-pop)', boxSizing: 'border-box',
        }}>
          {bar.items.map((item) => (
            <div key={item.preset.id} title={item.preset.label} style={{
              position: 'absolute', left: item.box.x - bar.bar.x, top: item.box.y - bar.bar.y, width: item.box.w, height: item.box.h,
            }}>
              {item.cells.map((cell, i) => {
                const on = target?.kind === 'preset' && target.presetId === item.preset.id && target.cell === i;
                return (
                  <div key={i} style={{
                    position: 'absolute',
                    left: cell.x - item.box.x + s, top: cell.y - item.box.y + s,
                    width: Math.max(0, cell.w - 2 * s), height: Math.max(0, cell.h - 2 * s),
                    background: on ? 'var(--accent)' : 'var(--surface-2)',
                    border: `${s}px solid ${on ? 'var(--accent)' : 'var(--hairline)'}`,
                    borderRadius: 'var(--radius-sm)', boxSizing: 'border-box',
                  }} />
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
