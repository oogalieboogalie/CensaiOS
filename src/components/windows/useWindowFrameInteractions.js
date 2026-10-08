import React from 'react';
import { MIN_WINDOW_SIZE } from '../../lib/windowSizeClasses.js';
import { SNAP_TOLERANCE } from '../../lib/layout/constants.js';
import { dragState } from '../../lib/layout/dragState.js';

// Edge snap against other windows. Returns the snapped position and the
// guide lines to draw (Figma-style), one per snapped axis.
export function snapToWindows(win, nx, ny, allWins, tolerance) {
  let sx = null, sy = null;
  for (const o of allWins) {
    if (o.id === win.id || o.hidden) continue;
    if (!sx) {
      if (Math.abs(nx - o.x) < tolerance) sx = { at: o.x, x: o.x, o };
      else if (Math.abs(nx - o.x - o.w) < tolerance) sx = { at: o.x + o.w, x: o.x + o.w, o };
      else if (Math.abs(nx + win.w - o.x) < tolerance) sx = { at: o.x, x: o.x - win.w, o };
      else if (Math.abs(nx + win.w - o.x - o.w) < tolerance) sx = { at: o.x + o.w, x: o.x + o.w - win.w, o };
    }
    if (!sy) {
      if (Math.abs(ny - o.y) < tolerance) sy = { at: o.y, y: o.y, o };
      else if (Math.abs(ny - o.y - o.h) < tolerance) sy = { at: o.y + o.h, y: o.y + o.h, o };
      else if (Math.abs(ny + win.h - o.y) < tolerance) sy = { at: o.y, y: o.y - win.h, o };
      else if (Math.abs(ny + win.h - o.y - o.h) < tolerance) sy = { at: o.y + o.h, y: o.y + o.h - win.h, o };
    }
  }
  const x = sx ? sx.x : nx;
  const y = sy ? sy.y : ny;
  const guides = [];
  if (sx) guides.push({ axis: 'x', at: sx.at, from: Math.min(y, sx.o.y), to: Math.max(y + win.h, sx.o.y + sx.o.h) });
  if (sy) guides.push({ axis: 'y', at: sy.at, from: Math.min(x, sy.o.x), to: Math.max(x + win.w, sy.o.x + sy.o.w) });
  return { x, y, guides };
}

// Drag / resize / wire interactions for a WindowFrame. Performance contract
// (PR #119): while a window is being dragged we write the frame's transform
// imperatively via frameRef and only commit x/y to state on pointer-up, so a
// drag never re-renders the React tree per pointermove.
// Grouped tiles: a plain drag moves the whole group (`groupDrag`); Shift-drag
// pulls the one window out. Loose windows report the pointer to dragState
// so the canvas can show drop zones and dock the window on release.
export function useWindowFrameInteractions({ win, onUpdate, onSelect, onDragEnd, onMovePreview, onWireStart, onWireDrag, onWireEnd, zoom, pan = { x: 0, y: 0 }, theme, allWins, frameRef, tileGroupId = null, groupDrag = null }) {
  const dragRef = React.useRef(null);

  const startDrag = (e) => {
    if (win.pinned) return;
    e.stopPropagation();
    onSelect(e);
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      const tag = document.activeElement.tagName;
      if (['INPUT', 'TEXTAREA'].includes(tag) || document.activeElement.contentEditable === 'true') {
        document.activeElement.blur();
      }
    }
    if (tileGroupId && groupDrag && !e.shiftKey) {
      dragRef.current = { x: e.clientX, y: e.clientY, mode: 'group', groupId: tileGroupId, first: true };
    } else {
      const box = frameRef?.current?.getBoundingClientRect?.();
      dragRef.current = {
        x: e.clientX, y: e.clientY, ox: win.x, oy: win.y, mode: 'move',
        gx: box ? (e.clientX - box.left) / zoom : win.w / 2,
        gy: box ? (e.clientY - box.top) / zoom : 16,
      };
    }
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  };

  const startResize = (e, dir) => {
    if (win.pinned) return;
    e.stopPropagation(); onSelect(e);
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      const tag = document.activeElement.tagName;
      if (['INPUT', 'TEXTAREA'].includes(tag) || document.activeElement.contentEditable === 'true') {
        document.activeElement.blur();
      }
    }
    dragRef.current = { x: e.clientX, y: e.clientY, ow: win.w, oh: win.h, ox: win.x, oy: win.y, mode: 'resize-' + dir };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  };

  const startWire = (e) => {
    e.stopPropagation(); onSelect(e);
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      const tag = document.activeElement.tagName;
      if (['INPUT', 'TEXTAREA'].includes(tag) || document.activeElement.contentEditable === 'true') {
        document.activeElement.blur();
      }
    }
    dragRef.current = { x: e.clientX, y: e.clientY, mode: 'wire' };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    onWireStart?.(win.id, { x: e.clientX, y: e.clientY });
  };

  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    const d = dragRef.current;
    if (d.mode === 'wire') return onWireDrag?.({ x: e.clientX, y: e.clientY });
    const dx = (e.clientX - d.x) / zoom, dy = (e.clientY - d.y) / zoom;
    if (d.mode === 'group') {
      groupDrag.move(d.groupId, dx, dy, d.first);
      d.first = false;
      return;
    }
    if (d.mode === 'move') {
      const snapped = theme.gridSnapping !== false
        ? snapToWindows(win, d.ox + dx, d.oy + dy, allWins, SNAP_TOLERANCE)
        : { x: d.ox + dx, y: d.oy + dy, guides: [] };
      const nx = snapped.x, ny = snapped.y;

      if (frameRef?.current) {
        frameRef.current.style.transform = `translate(${pan.x + nx * zoom}px, ${pan.y + ny * zoom}px) scale(${zoom})`;
      }
      d.lastNx = nx;
      d.lastNy = ny;
      dragState.update({
        winId: win.id,
        point: { x: d.ox + dx + d.gx, y: d.oy + dy + d.gy },
        rect: { x: nx, y: ny, w: win.w, h: win.h },
        guides: snapped.guides,
        free: e.ctrlKey || e.metaKey,
      });
      // Fade the window while it is over a drop zone so the landing preview
      // and the tiles underneath stay visible.
      if (frameRef?.current) frameRef.current.style.opacity = dragState.get()?.target ? '0.55' : '';
      onMovePreview?.(win.id, { x: nx, y: ny, phase: 'move' });
    } else if (d.mode.startsWith('resize-')) {
      const dir = d.mode.split('-')[1];
      let nw = d.ow, nh = d.oh, nx = d.ox, ny = d.oy;
      if (dir.includes('r')) nw = Math.max(MIN_WINDOW_SIZE.w, d.ow + dx);
      if (dir.includes('b')) nh = Math.max(MIN_WINDOW_SIZE.h, d.oh + dy);
      if (dir.includes('l')) { nw = Math.max(MIN_WINDOW_SIZE.w, d.ow - dx); nx = d.ox + (d.ow - nw); }
      if (dir.includes('t')) { nh = Math.max(MIN_WINDOW_SIZE.h, d.oh - dy); ny = d.oy + (d.oh - nh); }
      onUpdate({ w: nw, h: nh, x: nx, y: ny });
    }
  };

  const onPointerUp = (e) => {
    if (dragRef.current && dragRef.current.mode === 'group') {
      if (!dragRef.current.first) groupDrag.end(dragRef.current.groupId);
    } else if (dragRef.current && dragRef.current.mode === 'move') {
      onMovePreview?.(win.id, {
        x: dragRef.current.lastNx ?? win.x,
        y: dragRef.current.lastNy ?? win.y,
        phase: 'end',
      });
      if (typeof dragRef.current.lastNx === 'number') onUpdate({ x: dragRef.current.lastNx, y: dragRef.current.lastNy });
      onDragEnd?.(win.id, {
        x: dragRef.current.lastNx ?? win.x,
        y: dragRef.current.lastNy ?? win.y,
      }, { moved: typeof dragRef.current.lastNx === 'number', dock: dragState.get()?.target || null });
      dragState.clear();
      if (frameRef?.current) frameRef.current.style.opacity = '';
    } else if (dragRef.current && dragRef.current.mode === 'wire') {
      onWireEnd?.(win.id, { x: e.clientX, y: e.clientY });
    }
    dragRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
  };

  return { startDrag, startResize, startWire, onPointerMove, onPointerUp };
}
