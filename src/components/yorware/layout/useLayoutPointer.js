// Pointer handling for the YorWare Layout page: draw new frames, select, move
// (snapping to the margins and the page's middle) and resize from the
// corners. Dragging is previewed locally and saved to the board once, when
// you let go, so a drag is one change for teammates and one undo step.
import React from 'react';
import { MASTER } from '../../../lib/yorware/layoutModel.js';
import { LAYOUT_INK } from '../../../lib/yorware/layoutTemplates.js';

const DRAW_TOOLS = new Set(['text', 'image', 'rect', 'ellipse', 'line']);
const DEFAULT_BOX = { text: [220, 80], image: [220, 160], rect: [140, 90], ellipse: [120, 120] };

function newFrame(tool, box) {
  if (tool === 'text') return { type: 'text', ...box, fill: 'none', stroke: 'none' };
  if (tool === 'image') return { type: 'image', ...box, fit: 'fill' };
  if (tool === 'line') return { type: 'line', ...box, stroke: LAYOUT_INK.black, sw: 2 };
  return { type: tool, ...box, fill: LAYOUT_INK.amber, stroke: 'none', sw: 0 };
}

/** Snap a moving box's edges and middle to the page edges, margins and middle. */
function snap(box, doc, tol) {
  const xs = [0, doc.margin, doc.w / 2, doc.w - doc.margin, doc.w];
  const ys = [0, doc.margin, doc.h / 2, doc.h - doc.margin, doc.h];
  const guides = [];
  const pick = (edges, lines, axis) => {
    let best = null;
    for (const [i, e] of edges.entries()) for (const l of lines) if (Math.abs(l - e) <= tol && (!best || Math.abs(l - e) < Math.abs(best.d))) best = { d: l - e, l, i };
    if (best) guides.push({ axis, at: best.l });
    return best ? best.d : 0;
  };
  const dx = pick([box.x, box.x + box.w / 2, box.x + box.w], xs, 'x');
  const dy = pick([box.y, box.y + box.h / 2, box.y + box.h], ys, 'y');
  return { dx, dy, guides };
}

export function useLayoutPointer(p, svgRef, scale, { onEditText, onPickPicture }) {
  const [drag, setDrag] = React.useState(null);
  // The frame under the last press: a double-click arrives at the page
  // itself once the press captured the pointer.
  const lastHit = React.useRef(null);
  const { doc, tool, selected, pageId } = p;

  const toPage = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  };
  const frameAt = (e) => {
    const el = e.target.closest?.('[data-frame]');
    if (!el || el.dataset.master === 'true') return null;
    const id = el.dataset.frame;
    return doc.frames[id] && doc.frames[id].page === pageId ? id : null;
  };

  const down = (e) => {
    if (e.button !== 0 || !pageId) return;
    const at = toPage(e);
    lastHit.current = frameAt(e);
    // Presses below are preventDefault()ed, so give the window the keyboard
    // (Delete, arrows, Ctrl+Z) by hand.
    svgRef.current.closest('[data-app="layout"]')?.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (DRAW_TOOLS.has(tool)) { e.preventDefault(); setDrag({ kind: 'draw', from: at, to: at }); return; }
    const id = frameAt(e);
    if (tool === 'link') { if (id) p.linkTo(id); else { p.setLinkFrom(null); p.setTool('select'); } return; }
    const handle = e.target.dataset?.handle;
    if (handle && selected.length === 1) {
      e.preventDefault();
      setDrag({ kind: 'resize', dir: handle, from: at, start: { ...doc.frames[selected[0]] }, id: selected[0] });
      return;
    }
    if (!id) { p.select([]); return; }
    e.preventDefault();
    const ids = e.shiftKey ? [...new Set([...selected, id])] : selected.includes(id) ? selected : [id];
    p.select(ids);
    setDrag({ kind: 'move', from: at, ids, start: Object.fromEntries(ids.map((x) => [x, { ...doc.frames[x] }])) });
  };

  const move = (e) => {
    if (!drag) return;
    const at = toPage(e);
    const dx = at.x - drag.from.x;
    const dy = at.y - drag.from.y;
    if (drag.kind === 'draw') { setDrag({ ...drag, to: at }); return; }
    if (drag.kind === 'move') {
      const first = drag.start[drag.ids[0]];
      const s = e.altKey ? { dx: 0, dy: 0, guides: [] } : snap({ ...first, x: first.x + dx, y: first.y + dy }, doc, 6 / scale);
      const frames = {};
      for (const id of drag.ids) frames[id] = { ...drag.start[id], x: drag.start[id].x + dx + s.dx, y: drag.start[id].y + dy + s.dy };
      setDrag({ ...drag, frames, guides: s.guides, moved: Math.abs(dx) + Math.abs(dy) > 0.5 });
      return;
    }
    const s = drag.start;
    let { x, y, w, h } = s;
    if (drag.dir.includes('w')) { x = s.x + dx; w = s.w - dx; } else { w = s.w + dx; }
    if (drag.dir.includes('n')) { y = s.y + dy; h = s.h - dy; } else { h = s.h + dy; }
    let dir = s.dir;
    if (s.type === 'line') {
      // A line keeps its ends under the pointer, even when dragged past the other end.
      if ((w < 0) !== (h < 0)) dir = -(s.dir || 1);
      if (w < 0) { x += w; w = -w; }
      if (h < 0) { y += h; h = -h; }
    } else {
      if (w < 6) { if (drag.dir.includes('w')) x = s.x + s.w - 6; w = 6; }
      if (h < 6) { if (drag.dir.includes('n')) y = s.y + s.h - 6; h = 6; }
      if (e.shiftKey && s.type !== 'text') { const r = s.w / s.h; if (w / h > r) h = w / r; else w = h * r; }
    }
    setDrag({ ...drag, frames: { [drag.id]: { ...s, x, y, w, h, dir } }, moved: true });
  };

  const up = () => {
    if (!drag) return;
    setDrag(null);
    if (drag.kind === 'draw') {
      const { from, to } = drag;
      let box = { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), w: Math.abs(to.x - from.x), h: Math.abs(to.y - from.y) };
      if (tool === 'line') {
        if (box.w + box.h < 4) return;
        box = { ...box, dir: (to.x - from.x) * (to.y - from.y) < 0 ? -1 : 1 };
      } else if (box.w < 8 || box.h < 8) {
        const [w, h] = DEFAULT_BOX[tool];
        box = { x: from.x, y: from.y, w, h };
      }
      const id = p.addFrame(newFrame(tool, box));
      if (id && tool === 'text') onEditText?.();
      return;
    }
    if (drag.moved && drag.frames) p.changeFrames(drag.frames);
  };

  const dblclick = (e) => {
    const id = frameAt(e) || lastHit.current;
    if (!id) return;
    if (doc.frames[id].type === 'text') { p.select([id]); onEditText?.(); }
    if (doc.frames[id].type === 'image') { p.select([id]); onPickPicture?.(id); }
  };

  const draft = drag?.kind === 'draw' ? {
    x: Math.min(drag.from.x, drag.to.x), y: Math.min(drag.from.y, drag.to.y), w: Math.abs(drag.to.x - drag.from.x), h: Math.abs(drag.to.y - drag.from.y),
  } : null;
  return { down, move, up, cancel: () => setDrag(null), dblclick, frames: drag?.frames || null, guides: drag?.guides || [], draft, isMaster: pageId === MASTER };
}
