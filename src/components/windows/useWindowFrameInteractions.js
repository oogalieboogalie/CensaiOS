import React from 'react';

// Drag / resize / wire interactions for a WindowFrame. Performance contract
// (PR #119): while a window is being dragged we write the frame's transform
// imperatively via frameRef and only commit x/y to state on pointer-up, so a
// drag never re-renders the React tree per pointermove.
export function useWindowFrameInteractions({ win, onUpdate, onSelect, onDragEnd, onMovePreview, onWireStart, onWireDrag, onWireEnd, zoom, pan = { x: 0, y: 0 }, theme, allWins, frameRef }) {
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
    dragRef.current = { x: e.clientX, y: e.clientY, ox: win.x, oy: win.y, mode: 'move' };
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
    if (d.mode === 'move') {
      let nx = d.ox + dx, ny = d.oy + dy;
      const SNAP = theme.gridSnapping !== false ? 12 : 0;
      let sx = false, sy = false;
      for (const o of allWins) {
        if (o.id === win.id) continue;
        if (!sx) {
          if (Math.abs(nx - o.x) < SNAP) { nx = o.x; sx = true; }
          else if (Math.abs(nx - o.x - o.w) < SNAP) { nx = o.x + o.w; sx = true; }
          else if (Math.abs(nx + win.w - o.x) < SNAP) { nx = o.x - win.w; sx = true; }
          else if (Math.abs(nx + win.w - o.x - o.w) < SNAP) { nx = o.x + o.w - win.w; sx = true; }
        }
        if (!sy) {
          if (Math.abs(ny - o.y) < SNAP) { ny = o.y; sy = true; }
          else if (Math.abs(ny - o.y - o.h) < SNAP) { ny = o.y + o.h; sy = true; }
          else if (Math.abs(ny + win.h - o.y) < SNAP) { ny = o.y - win.h; sy = true; }
          else if (Math.abs(ny + win.h - o.y - o.h) < SNAP) { ny = o.y + o.h - win.h; sy = true; }
        }
      }

      if (frameRef?.current) {
        frameRef.current.style.transform = `translate(${pan.x + nx * zoom}px, ${pan.y + ny * zoom}px) scale(${zoom})`;
      }
      d.lastNx = nx;
      d.lastNy = ny;
      onMovePreview?.(win.id, { x: nx, y: ny, phase: 'move' });
    } else if (d.mode.startsWith('resize-')) {
      const dir = d.mode.split('-')[1];
      let nw = d.ow, nh = d.oh, nx = d.ox, ny = d.oy;
      if (dir.includes('r')) nw = Math.max(220, d.ow + dx);
      if (dir.includes('b')) nh = Math.max(140, d.oh + dy);
      if (dir.includes('l')) { nw = Math.max(220, d.ow - dx); nx = d.ox + (d.ow - nw); }
      if (dir.includes('t')) { nh = Math.max(140, d.oh - dy); ny = d.oy + (d.oh - nh); }
      onUpdate({ w: nw, h: nh, x: nx, y: ny });
    }
  };

  const onPointerUp = (e) => {
    if (dragRef.current && dragRef.current.mode === 'move') {
      onMovePreview?.(win.id, {
        x: dragRef.current.lastNx ?? win.x,
        y: dragRef.current.lastNy ?? win.y,
        phase: 'end',
      });
      if (typeof dragRef.current.lastNx === 'number') onUpdate({ x: dragRef.current.lastNx, y: dragRef.current.lastNy });
      onDragEnd?.(win.id, {
        x: dragRef.current.lastNx ?? win.x,
        y: dragRef.current.lastNy ?? win.y,
      }, { moved: typeof dragRef.current.lastNx === 'number' });
    } else if (dragRef.current && dragRef.current.mode === 'wire') {
      onWireEnd?.(win.id, { x: e.clientX, y: e.clientY });
    }
    dragRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
  };

  return { startDrag, startResize, startWire, onPointerMove, onPointerUp };
}
