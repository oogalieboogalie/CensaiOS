/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { MASTER } from '../../../lib/yorware/layoutModel.js';
import { flowDocument, pageItems } from '../../../lib/yorware/layoutPlan.js';
import { LayoutItem } from './LayoutItem.jsx';
import { useLayoutPointer } from './useLayoutPointer.js';

const CORNERS = ['nw', 'ne', 'sw', 'se'];
const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');

/**
 * The page you're working on, drawn in page points and scaled to the window:
 * the margins, the master items (shown, but edited on the Master page), the
 * page's own frames, and the selection with its corner handles. A red plus
 * marks a text frame whose story doesn't fit yet.
 */
export function LayoutPage({ p, scale, onEditText, onPickPicture }) {
  const svgRef = React.useRef(null);
  const ptr = useLayoutPointer(p, svgRef, scale, { onEditText, onPickPicture });
  const { pageId, selected } = p;
  // While dragging, draw (and re-flow) the frames where the pointer has them.
  const doc = React.useMemo(() => (ptr.frames ? { ...p.doc, frames: { ...p.doc.frames, ...ptr.frames } } : p.doc), [p.doc, ptr.frames]);
  const flow = React.useMemo(() => (ptr.frames ? flowDocument(doc) : p.flow), [doc, ptr.frames, p.flow]);
  const items = React.useMemo(() => pageItems(doc, pageId, flow), [doc, pageId, flow]);
  const u = 1 / scale;
  const sel = selected.map((id) => doc.frames[id]).filter(Boolean);
  const box = sel.length ? {
    x: Math.min(...sel.map((f) => f.x)), y: Math.min(...sel.map((f) => f.y)),
    r: Math.max(...sel.map((f) => f.x + f.w)), b: Math.max(...sel.map((f) => f.y + f.h)),
  } : null;
  const one = sel.length === 1 ? sel[0] : null;
  const chain = one?.type === 'text' ? flow[selected[0]] : null;
  const label = pageId === MASTER ? 'Master page' : `Page ${p.pageIndex + 1} of ${doc.order.length}`;

  const onDrop = (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    const r = svgRef.current.getBoundingClientRect();
    const at = { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
    const el = e.target.closest?.('[data-frame]');
    const frameId = el && doc.frames[el.dataset.frame]?.type === 'image' && el.dataset.master !== 'true' ? el.dataset.frame : null;
    p.addPicture(e.dataTransfer.files[0], { frameId, at });
  };

  return (
    <svg ref={svgRef} className="hb-yl-page" data-tool={p.tool} data-master-page={pageId === MASTER ? 'true' : undefined}
      width={doc.w * scale} height={doc.h * scale} viewBox={`0 0 ${doc.w} ${doc.h}`} role="img" aria-label={label} data-no-drag
      onPointerDown={ptr.down} onPointerMove={ptr.move} onPointerUp={ptr.up} onPointerCancel={ptr.cancel} onDoubleClick={ptr.dblclick}
      onDragOver={(e) => { if (hasFiles(e)) { e.preventDefault(); e.stopPropagation(); } }} onDrop={onDrop}>
      <rect width={doc.w} height={doc.h} className="hb-yl-paper" />
      {doc.margin > 0 && <rect x={doc.margin} y={doc.margin} width={doc.w - doc.margin * 2} height={doc.h - doc.margin * 2} className="hb-yl-margin" strokeWidth={u} />}
      {items.map((item) => <LayoutItem key={item.id} item={item} doc={doc} guides />)}
      {items.filter((i) => !i.master && i.text?.overflow).map(({ id, frame: f }) => (
        <g key={`o${id}`} className="hb-yl-overflow" aria-label="This text does not fit yet">
          <rect x={f.x + f.w - 5 * u} y={f.y + f.h - 5 * u} width={10 * u} height={10 * u} strokeWidth={u} />
          <path d={`M${f.x + f.w - 3 * u} ${f.y + f.h}h${6 * u}M${f.x + f.w} ${f.y + f.h - 3 * u}v${6 * u}`} strokeWidth={1.4 * u} />
        </g>
      ))}
      {ptr.guides.map((g, i) => (g.axis === 'x'
        ? <line key={i} x1={g.at} x2={g.at} y1={0} y2={doc.h} className="hb-yl-snap" strokeWidth={u} />
        : <line key={i} y1={g.at} y2={g.at} x1={0} x2={doc.w} className="hb-yl-snap" strokeWidth={u} />))}
      {box && (
        <g className="hb-yl-frame">
          <rect x={box.x} y={box.y} width={Math.max(box.r - box.x, u)} height={Math.max(box.b - box.y, u)} strokeWidth={u} className="hb-yl-frame-box" />
          {one && p.tool === 'select' && CORNERS.map((dir) => (
            <rect key={dir} x={(dir.includes('w') ? box.x : box.r) - 4 * u} y={(dir.includes('n') ? box.y : box.b) - 4 * u}
              width={8 * u} height={8 * u} strokeWidth={u} className="hb-yl-grip" data-dir={dir} data-handle={dir} />
          ))}
          {chain?.count > 1 && (
            <g className="hb-yl-badge">
              <rect x={box.r - 34 * u} y={box.y - 16 * u} width={34 * u} height={14 * u} rx={3 * u} />
              <text x={box.r - 17 * u} y={box.y - 5.5 * u} fontSize={9 * u} textAnchor="middle">{chain.index + 1} of {chain.count}</text>
            </g>
          )}
        </g>
      )}
      {ptr.draft && <rect x={ptr.draft.x} y={ptr.draft.y} width={ptr.draft.w} height={ptr.draft.h} strokeWidth={u} className="hb-yl-draft" />}
    </svg>
  );
}
