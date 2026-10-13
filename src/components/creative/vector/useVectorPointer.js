// Pointer handling for the Censai Vector artboard: select, move, resize,
// marquee, draw rectangles / ellipses / lines, place text, the pen, and
// dragging path points and their bezier handles.
import React from 'react';
import { expandGroups, makeShape, selectionBox } from '../../../lib/creative/vectorModel.js';
import { corner, moveShape, shapeBox, transformShape } from '../../../lib/creative/vectorGeom.js';

function resizeBox(from, dir, pt, keepRatio) {
  let { x, y, w, h } = from;
  if (dir.includes('e')) w = pt.x - from.x;
  if (dir.includes('w')) { x = pt.x; w = from.x + from.w - pt.x; }
  if (dir.includes('s')) h = pt.y - from.y;
  if (dir.includes('n')) { y = pt.y; h = from.y + from.h - pt.y; }
  w = Math.max(1, w);
  h = Math.max(1, h);
  if (dir.includes('w')) x = Math.min(x, from.x + from.w - 1);
  if (dir.includes('n')) y = Math.min(y, from.y + from.h - 1);
  if (keepRatio && from.w && from.h) {
    const k = Math.max(w / from.w, h / from.h);
    const nw = from.w * k; const nh = from.h * k;
    if (dir.includes('w')) x = from.x + from.w - nw;
    if (dir.includes('n')) y = from.y + from.h - nh;
    w = nw; h = nh;
  }
  return { x, y, w, h };
}

/** Move one path point (anchor or handle). Smooth points keep their handles in line. */
export function movePoint(shape, si, pi, part, pt, free) {
  const subpaths = shape.subpaths.map((sp, i) => (i !== si ? sp : {
    ...sp,
    pts: sp.pts.map((p, j) => {
      if (j !== pi) return p;
      if (part === 'anchor') {
        const dx = pt.x - p.x; const dy = pt.y - p.y;
        return { x: pt.x, y: pt.y, ix: p.ix + dx, iy: p.iy + dy, ox: p.ox + dx, oy: p.oy + dy };
      }
      const other = part === 'in' ? 'o' : 'i';
      const mine = part === 'in' ? 'i' : 'o';
      const otherAtAnchor = p[`${other}x`] === p.x && p[`${other}y`] === p.y;
      const next = { ...p, [`${mine}x`]: pt.x, [`${mine}y`]: pt.y };
      if (!free && !otherAtAnchor) { next[`${other}x`] = 2 * p.x - pt.x; next[`${other}y`] = 2 * p.y - pt.y; }
      return next;
    }),
  }));
  return { ...shape, subpaths };
}

export function useVectorPointer(v, svgRef, scale) {
  const { doc, tool } = v;
  const drag = React.useRef(null);
  // Pointer capture retargets the click and dblclick that follow to the
  // artboard, so remember which shape the press landed on.
  const lastHit = React.useRef(null);
  const [preview, setPreview] = React.useState({});
  const [marquee, setMarquee] = React.useState(null);
  const [pen, setPen] = React.useState(null); // { pts, cursor }

  const toDoc = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * doc.w) / r.width, y: ((e.clientY - r.top) * doc.h) / r.height };
  };

  const finishPen = (closed = false) => {
    setPen(null);
    if (!pen) return;
    const pts = pen.pts.filter((p, i, all) => i === 0 || p.x !== all[i - 1].x || p.y !== all[i - 1].y);
    if (pts.length < 2) return;
    v.addShape('path', { subpaths: [{ pts, closed }], open: !closed });
  };

  const down = (e) => {
    if (e.button !== 0) return;
    const pt = toDoc(e);
    svgRef.current.setPointerCapture?.(e.pointerId);
    const handle = e.target.closest?.('[data-handle]')?.getAttribute('data-handle');
    const hitId = e.target.closest?.('[data-shape]')?.getAttribute('data-shape');
    lastHit.current = hitId || null;
    if (tool === 'pen') {
      const first = pen?.pts[0];
      if (first && pen.pts.length > 1 && Math.hypot(pt.x - first.x, pt.y - first.y) < 10 / scale) { finishPen(true); return; }
      const pts = [...(pen?.pts || []), corner(pt.x, pt.y)];
      setPen({ pts, cursor: pt });
      drag.current = { kind: 'pen', index: pts.length - 1 };
      return;
    }
    if (tool === 'text') { v.addShape('text', { x: pt.x, y: pt.y }); return; }
    if (tool === 'rect' || tool === 'ellipse' || tool === 'line') { drag.current = { kind: 'create', type: tool, start: pt }; return; }
    if (handle?.startsWith('pt:')) {
      const [, si, pi, part] = handle.split(':');
      drag.current = { kind: 'point', id: v.editId, si: Number(si), pi: Number(pi), part, orig: doc.shapes[v.editId] };
      return;
    }
    if (handle?.startsWith('rs:')) {
      const ids = v.selected;
      drag.current = { kind: 'resize', dir: handle.slice(3), ids, from: selectionBox(doc, ids), orig: Object.fromEntries(ids.map((id) => [id, doc.shapes[id]])) };
      return;
    }
    if (hitId) {
      if (v.editId && hitId !== v.editId) v.setEditId(null);
      let ids = v.selected.includes(hitId) && !e.shiftKey ? v.selected : expandGroups(doc, [hitId]);
      if (e.shiftKey) { v.select([hitId], { add: true }); return; }
      if (!v.selected.includes(hitId)) v.select([hitId]);
      ids = ids.filter((id) => doc.shapes[id]);
      drag.current = { kind: 'move', ids, start: pt, orig: Object.fromEntries(ids.map((id) => [id, doc.shapes[id]])) };
      return;
    }
    if (!e.shiftKey) v.clear();
    drag.current = { kind: 'marquee', start: pt };
  };

  const move = (e) => {
    const pt = toDoc(e);
    const d = drag.current;
    if (tool === 'pen' && pen && !d) { setPen({ ...pen, cursor: pt }); return; }
    if (!d) return;
    if (d.kind === 'pen') {
      const pts = pen.pts.map((p, i) => (i !== d.index ? p : { ...p, ox: pt.x, oy: pt.y, ix: 2 * p.x - pt.x, iy: 2 * p.y - pt.y }));
      setPen({ pts, cursor: pt });
    } else if (d.kind === 'move') {
      let dx = pt.x - d.start.x; let dy = pt.y - d.start.y;
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      setPreview(Object.fromEntries(d.ids.map((id) => [id, moveShape(d.orig[id], dx, dy)])));
    } else if (d.kind === 'resize') {
      const to = resizeBox(d.from, d.dir, pt, e.shiftKey);
      setPreview(Object.fromEntries(d.ids.map((id) => [id, transformShape(d.orig[id], d.from, to)])));
    } else if (d.kind === 'point') {
      setPreview({ [d.id]: movePoint(d.orig, d.si, d.pi, d.part, pt, e.altKey) });
    } else if (d.kind === 'create') {
      let w = pt.x - d.start.x; let h = pt.y - d.start.y;
      if (e.shiftKey && d.type !== 'line') { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
      const geo = d.type === 'line' ? { x1: d.start.x, y1: d.start.y, x2: d.start.x + w, y2: d.start.y + h }
        : { x: Math.min(d.start.x, d.start.x + w), y: Math.min(d.start.y, d.start.y + h), w: Math.abs(w), h: Math.abs(h) };
      d.geo = geo;
      setPreview({ __new: { ...makeShape(d.type, geo), ...(d.type === 'line' ? {} : { fill: v.style.fill, stroke: v.style.stroke, sw: v.style.sw }) } });
    } else if (d.kind === 'marquee') {
      setMarquee({ x: Math.min(d.start.x, pt.x), y: Math.min(d.start.y, pt.y), w: Math.abs(pt.x - d.start.x), h: Math.abs(pt.y - d.start.y) });
    }
  };

  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind === 'move' || d.kind === 'resize' || d.kind === 'point') {
      if (Object.keys(preview).length) v.change(preview);
    } else if (d.kind === 'create') {
      const tiny = !d.geo || (d.type === 'line' ? Math.hypot(d.geo.x2 - d.geo.x1, d.geo.y2 - d.geo.y1) < 4 : d.geo.w < 4 || d.geo.h < 4);
      const s = d.start;
      const geo = !tiny ? d.geo : d.type === 'line' ? { x1: s.x, y1: s.y, x2: s.x + 160, y2: s.y } : { x: s.x, y: s.y, w: 160, h: 120 };
      v.addShape(d.type, d.type === 'rect' ? { ...geo, rx: 0 } : geo);
    } else if (d.kind === 'marquee' && marquee && (marquee.w > 2 || marquee.h > 2)) {
      const hits = doc.order.filter((id) => {
        const b = shapeBox(doc.shapes[id]);
        return b.x < marquee.x + marquee.w && b.x + b.w > marquee.x && b.y < marquee.y + marquee.h && b.y + b.h > marquee.y;
      });
      v.select(hits, { add: true });
    }
    setPreview({});
    setMarquee(null);
  };

  const dblclick = (e) => {
    if (tool === 'pen') { finishPen(false); return; }
    const id = e.target.closest?.('[data-shape]')?.getAttribute('data-shape') || lastHit.current;
    if (id && tool === 'select') v.editPoints(id);
  };

  return { down, move, up, dblclick, preview, marquee, pen, finishPen, cancelPen: () => setPen(null) };
}
