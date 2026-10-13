/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { composite, makeCanvas, textBox } from '../../../lib/creative/photoRender.js';
import { normRect } from '../../../lib/creative/photoModel.js';
import { localRect } from './usePhoto.js';
import { useFitScale } from '../useFitScale.js';

function hex(n) {
  return n.toString(16).padStart(2, '0');
}

/** The picture itself, and every pointer tool: brush, eraser, move, select, text, color picker. */
export function PhotoStage({ p, zoom, alpha, onNotice }) {
  const { doc, surfaces, layer, current, tool, color, size, selection } = p;
  const wrapRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const work = React.useRef(null);
  const [cursor, setCursor] = React.useState(null);
  const fit = useFitScale(wrapRef, doc.w, doc.h);
  const scale = zoom === 'fit' ? fit : Number(zoom);

  const paint = React.useCallback((extra = {}) => {
    const c = canvasRef.current;
    if (!c) return;
    composite(c.getContext('2d'), doc, surfaces, extra);
  }, [doc, surfaces]);
  React.useEffect(() => { paint(work.current?.extra || {}); }, [paint]);

  const toDoc = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * doc.w) / r.width, y: ((e.clientY - r.top) * doc.h) / r.height };
  };

  const strokeTo = (w, pt) => {
    const ctx = w.stroke.getContext('2d');
    ctx.save();
    if (w.clip) { ctx.beginPath(); ctx.rect(w.clip.x, w.clip.y, w.clip.w, w.clip.h); ctx.clip(); }
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const lx = pt.x - (layer.x || 0);
    const ly = pt.y - (layer.y || 0);
    ctx.beginPath();
    if (w.last) { ctx.moveTo(w.last.x, w.last.y); ctx.lineTo(lx, ly); ctx.stroke(); } else { ctx.arc(lx, ly, size / 2, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    w.last = { x: lx, y: ly };
    const out = w.out.getContext('2d');
    out.clearRect(0, 0, w.out.width, w.out.height);
    out.drawImage(w.base, 0, 0);
    out.globalAlpha = alpha;
    out.globalCompositeOperation = w.erase ? 'destination-out' : 'source-over';
    out.drawImage(w.stroke, 0, 0);
    out.globalAlpha = 1;
    out.globalCompositeOperation = 'source-over';
    w.extra = { live: { [w.id]: w.out } };
    paint(w.extra);
  };

  const down = (e) => {
    if (e.button !== 0) return;
    const pt = toDoc(e);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (tool === 'brush' || tool === 'eraser') {
      if (!layer || layer.kind !== 'raster' || !surfaces[current]) { onNotice('Pick a picture layer to paint on, or add one with New layer.'); return; }
      if (layer.visible === false) { onNotice('This layer is hidden. Show it to paint on it.'); return; }
      const base = surfaces[current];
      work.current = {
        kind: 'paint', id: current, base, erase: tool === 'eraser', last: null,
        stroke: makeCanvas(base.width, base.height), out: makeCanvas(base.width, base.height),
        clip: selection ? localRect(normRect(selection), layer) : null,
      };
      strokeTo(work.current, pt);
    } else if (tool === 'move' && layer) {
      work.current = { kind: 'move', id: current, start: pt, extra: {} };
    } else if (tool === 'select') {
      work.current = { kind: 'select', start: pt };
      p.setSelection({ x: pt.x, y: pt.y, w: 0, h: 0 });
    } else if (tool === 'text') {
      const ctx = canvasRef.current.getContext('2d');
      const hit = [...doc.order].reverse().find((id) => {
        const l = doc.layers[id];
        if (l.kind !== 'text') return false;
        const b = textBox(ctx, l);
        return pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h;
      });
      if (hit) p.select(hit); else p.addText(pt.x, pt.y);
    } else if (tool === 'pick') {
      const d = canvasRef.current.getContext('2d').getImageData(Math.floor(pt.x), Math.floor(pt.y), 1, 1).data;
      p.setColor(`#${hex(d[0])}${hex(d[1])}${hex(d[2])}`);
    }
  };

  const moveEv = (e) => {
    const pt = toDoc(e);
    if (tool === 'brush' || tool === 'eraser') setCursor({ x: pt.x, y: pt.y });
    const w = work.current;
    if (!w) return;
    if (w.kind === 'paint') strokeTo(w, pt);
    else if (w.kind === 'move') {
      w.extra = { moving: { id: w.id, dx: Math.round(pt.x - w.start.x), dy: Math.round(pt.y - w.start.y) } };
      paint(w.extra);
    } else if (w.kind === 'select') {
      p.setSelection({ x: w.start.x, y: w.start.y, w: pt.x - w.start.x, h: pt.y - w.start.y });
    }
  };

  const up = () => {
    const w = work.current;
    work.current = null;
    if (!w) return;
    if (w.kind === 'paint') {
      const final = makeCanvas(w.out.width, w.out.height);
      final.getContext('2d').drawImage(w.out, 0, 0);
      p.commitSurface(w.id, final);
    } else if (w.kind === 'move') {
      const m = w.extra.moving;
      const l = doc.layers[w.id];
      if (m && (m.dx || m.dy) && l) p.setLayer(w.id, { x: (l.x || 0) + m.dx, y: (l.y || 0) + m.dy });
      else paint();
    } else if (w.kind === 'select' && selection) {
      const r = normRect(selection);
      p.setSelection(r.w < 3 || r.h < 3 ? null : r);
    }
  };

  const sel = selection && normRect(selection);
  const ring = cursor && (tool === 'brush' || tool === 'eraser');
  return (
    <div className="hb-cr-stage" ref={wrapRef} data-tool={tool}>
      <div className="hb-cr-art" style={{ width: doc.w * scale, height: doc.h * scale }}>
        <canvas ref={canvasRef} width={doc.w} height={doc.h} className="hb-cr-canvas" aria-label="Picture" role="img"
          onPointerDown={down} onPointerMove={moveEv} onPointerUp={up} onPointerCancel={up} onPointerLeave={() => setCursor(null)} data-no-drag />
        {sel && <div className="hb-cr-marquee" style={{ left: sel.x * scale, top: sel.y * scale, width: sel.w * scale, height: sel.h * scale }} />}
        {ring && <div className="hb-cr-brush" style={{ left: cursor.x * scale, top: cursor.y * scale, width: size * scale, height: size * scale }} />}
      </div>
    </div>
  );
}
