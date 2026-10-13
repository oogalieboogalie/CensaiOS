/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { drawPage } from '../../../lib/yorware/pdfRender.js';
import { shownRotation } from '../../../lib/yorware/pdfModel.js';
import { PdfMark } from './PdfMark.jsx';
import { PdfFormLayer } from './PdfFormLayer.jsx';

/**
 * The page you're working on: the PDF page drawn by pdf.js with what people
 * placed on it on top. Dragging is previewed locally and saved to the board
 * once, when you let go.
 */
export function PdfPageView({ p, scale, byFile, finds = [] }) {
  const { doc, page, pageId, size, tool, selected, editId } = p;
  const canvasRef = React.useRef(null);
  const layerRef = React.useRef(null);
  const [drag, setDrag] = React.useState(null);
  const file = page ? doc.files[page.file] : null;
  const rotation = page ? shownRotation(page) : 0;

  React.useEffect(() => {
    if (!page || !file || !canvasRef.current) return undefined;
    return drawPage(canvasRef.current, { fileId: page.file, data: file.data, index: page.index, rotation, scale });
  }, [page?.file, page?.index, rotation, scale, file?.data]);

  if (!page) return null;

  const toPage = (e) => {
    const r = layerRef.current.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  };
  const startDrag = (e, next) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ ...next, from: toPage(e) });
  };

  const onPagePointerDown = (e) => {
    if (e.button !== 0 || e.target.closest('[data-mark]')) return;
    const at = toPage(e);
    if (tool === 'text') { e.preventDefault(); p.addText(at.x, at.y); return; }
    if (tool === 'sign') {
      e.preventDefault();
      const flag = (doc.marksByPage[pageId] || []).find((mid) => {
        const m = doc.marks[mid];
        return m.type === 'signHere' && at.x >= m.x && at.x <= m.x + m.w && at.y >= m.y && at.y <= m.y + m.h;
      });
      if (flag) p.signInto(doc.marks[flag], flag); else p.addSignature(at.x, at.y);
      return;
    }
    if (tool === 'highlight' || tool === 'redact') { startDrag(e, { kind: 'draw', type: tool, box: { x: at.x, y: at.y, w: 0, h: 0 } }); return; }
    p.setSelected(null);
    p.setEditId(null);
  };
  const onMarkPointerDown = (id) => (e) => {
    if (e.button !== 0 || editId === id) return;
    e.stopPropagation();
    p.setSelected(id);
    if (editId) p.setEditId(null);
    const m = doc.marks[id];
    const kind = e.target.dataset?.handle === 'resize' ? 'resize' : 'move';
    startDrag(e, { kind, id, box: { x: m.x, y: m.y, w: m.w, h: m.h }, start: { x: m.x, y: m.y, w: m.w, h: m.h, size: m.size } });
  };
  const onPointerMove = (e) => {
    if (!drag) return;
    const at = toPage(e);
    const dx = at.x - drag.from.x;
    const dy = at.y - drag.from.y;
    if (drag.kind === 'draw') {
      setDrag({ ...drag, box: { x: Math.min(drag.from.x, at.x), y: Math.min(drag.from.y, at.y), w: Math.abs(dx), h: Math.abs(dy) } });
    } else if (drag.kind === 'move') {
      const s = drag.start;
      setDrag({ ...drag, box: { ...drag.box, x: Math.max(0, Math.min(size.w - s.w, s.x + dx)), y: Math.max(0, Math.min(size.h - s.h, s.y + dy)) } });
    } else {
      const s = drag.start;
      const w = Math.max(12, s.w + dx);
      const h = doc.marks[drag.id]?.type === 'sign' || doc.marks[drag.id]?.type === 'text' ? (s.h * w) / s.w : Math.max(6, s.h + dy);
      setDrag({ ...drag, box: { ...drag.box, w, h } });
    }
  };
  const onPointerUp = () => {
    if (!drag) return;
    const { kind, box, id, start } = drag;
    setDrag(null);
    if (kind === 'draw') {
      if (box.w > 3 && box.h > 3) p.addMark({ type: drag.type, ...box });
      return;
    }
    if (box.x === start.x && box.y === start.y && box.w === start.w && box.h === start.h) return;
    if (kind === 'resize' && doc.marks[id]?.type === 'text') {
      p.changeMark(id, { x: box.x, y: box.y, size: Math.max(6, Math.round((start.size || 14) * (box.w / start.w))) });
    } else {
      p.changeMark(id, box);
    }
  };

  const marks = doc.marksByPage[pageId] || [];
  return (
    <div className="hb-yp-page" ref={layerRef} data-tool={tool} style={{ width: size.w * scale, height: size.h * scale }}
      onPointerDown={onPagePointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => setDrag(null)}>
      <canvas ref={canvasRef} className="hb-yp-canvas" aria-label={`Page ${p.pageIndex + 1} of ${doc.order.length}`} />
      {marks.map((id) => {
        const m = doc.marks[id];
        const box = drag?.id === id ? drag.box : m;
        return (
          <PdfMark key={id} id={id} mark={m} box={box} scale={scale} selected={selected === id} editing={editId === id}
            onPointerDown={onMarkPointerDown(id)}
            onDoubleClick={() => { if (m.type === 'text') p.setEditId(id); if (m.type === 'signHere') p.signInto(m, id); }}
            onSign={() => p.signInto(m, id)}
            onText={(text) => p.changeMark(id, { text })} onEndEdit={() => p.setEditId(null)} />
        );
      })}
      <PdfFormLayer p={p} scale={scale} byFile={byFile} />
      {finds.map((b, i) => (
        <div key={i} className="hb-yp-find" data-current={b.current ? 'true' : undefined} aria-hidden="true"
          style={{ left: b.x * scale - 1, top: b.y * scale - 1, width: b.w * scale + 2, height: b.h * scale + 2 }} />
      ))}
      {drag?.kind === 'draw' && (
        <div className="hb-yp-draft" data-type={drag.type}
          style={{ left: drag.box.x * scale, top: drag.box.y * scale, width: drag.box.w * scale, height: drag.box.h * scale }} />
      )}
    </div>
  );
}
