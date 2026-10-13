/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { shapeSvg } from '../../../lib/creative/svgOut.js';
import { pathD, shapeBox, unionBox } from '../../../lib/creative/vectorGeom.js';
import { useVectorPointer } from './useVectorPointer.js';

const camel = (k) => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

/** One shape, drawn from the same description the .svg export uses. */
export function ShapeEl({ id, shape, hitWidth = 0 }) {
  const { tag, attrs, lines } = shapeSvg(shape);
  const props = { 'data-shape': id };
  for (const [k, val] of Object.entries(attrs)) if (val !== undefined) props[camel(k)] = val;
  if (lines) return <text {...props}>{lines.map((l, i) => <tspan key={i} x={attrs.x} dy={l.dy}>{l.t}</tspan>)}</text>;
  const el = React.createElement(tag, props);
  if (!hitWidth || (shape.type !== 'line' && !(shape.type === 'path' && shape.fill === 'none'))) return el;
  // Thin lines get a wider invisible twin so they are easy to click.
  const hit = { ...props, stroke: 'transparent', strokeWidth: hitWidth, fill: 'none', opacity: undefined, className: 'hb-cr-hit' };
  return <>{el}{React.createElement(tag, hit)}</>;
}

const DIRS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
function handleAt(b, dir) {
  const x = dir.includes('w') ? b.x : dir.includes('e') ? b.x + b.w : b.x + b.w / 2;
  const y = dir.includes('n') ? b.y : dir.includes('s') ? b.y + b.h : b.y + b.h / 2;
  return { x, y };
}

function PointEditor({ shape, u }) {
  return (
    <g className="hb-cr-points">
      {shape.subpaths.map((sp, si) => sp.pts.map((p, pi) => (
        <g key={`${si}.${pi}`}>
          {['i', 'o'].map((h) => (p[`${h}x`] !== p.x || p[`${h}y`] !== p.y) && (
            <g key={h}>
              <line x1={p.x} y1={p.y} x2={p[`${h}x`]} y2={p[`${h}y`]} className="hb-cr-handle-line" strokeWidth={u} />
              <circle cx={p[`${h}x`]} cy={p[`${h}y`]} r={4 * u} className="hb-cr-handle" strokeWidth={u} data-handle={`pt:${si}:${pi}:${h === 'i' ? 'in' : 'out'}`} />
            </g>
          ))}
          <rect x={p.x - 4 * u} y={p.y - 4 * u} width={8 * u} height={8 * u} className="hb-cr-anchor" strokeWidth={u} data-handle={`pt:${si}:${pi}:anchor`} />
        </g>
      )))}
    </g>
  );
}

/** The artboard: shapes, the selection frame and handles, the pen and marquee. */
export function VectorStage({ v, scale, penRef }) {
  const svgRef = React.useRef(null);
  const ptr = useVectorPointer(v, svgRef, scale);
  const { doc } = v;
  const u = 1 / scale;
  const shapes = { ...doc.shapes, ...ptr.preview };
  const order = ptr.preview.__new ? [...doc.order, '__new'] : doc.order;
  const box = !v.editId && v.selected.length ? unionBox(v.selected.map((id) => shapeBox(shapes[id]))) : null;
  const editing = v.editId && shapes[v.editId]?.type === 'path' ? shapes[v.editId] : null;
  React.useImperativeHandle(penRef, () => ptr, [ptr]);

  return (
    <svg ref={svgRef} className="hb-cr-svg" data-tool={v.tool} width={doc.w * scale} height={doc.h * scale}
      viewBox={`0 0 ${doc.w} ${doc.h}`} role="img" aria-label="Artboard" data-no-drag
      onPointerDown={ptr.down} onPointerMove={ptr.move} onPointerUp={ptr.up} onPointerCancel={ptr.up} onDoubleClick={ptr.dblclick}>
      {doc.bg ? <rect width={doc.w} height={doc.h} fill={doc.bg} className="hb-cr-board" /> : <rect width={doc.w} height={doc.h} fill="transparent" className="hb-cr-board" />}
      {order.map((id) => shapes[id] && <ShapeEl key={id} id={id === '__new' ? undefined : id} shape={shapes[id]} hitWidth={10 * u} />)}
      {box && (
        <g className="hb-cr-frame">
          <rect x={box.x} y={box.y} width={Math.max(box.w, u)} height={Math.max(box.h, u)} strokeWidth={u} className="hb-cr-frame-box" />
          {v.tool === 'select' && DIRS.map((dir) => {
            const h = handleAt(box, dir);
            return <rect key={dir} x={h.x - 4 * u} y={h.y - 4 * u} width={8 * u} height={8 * u} strokeWidth={u} className="hb-cr-grip" data-dir={dir} data-handle={`rs:${dir}`} />;
          })}
        </g>
      )}
      {editing && <PointEditor shape={editing} u={u} />}
      {ptr.marquee && <rect {...{ x: ptr.marquee.x, y: ptr.marquee.y, width: ptr.marquee.w, height: ptr.marquee.h }} strokeWidth={u} className="hb-cr-marquee-svg" />}
      {ptr.pen && (
        <g className="hb-cr-pen">
          <path d={pathD({ subpaths: [{ pts: ptr.pen.pts, closed: false }] })} strokeWidth={1.5 * u} fill="none" />
          {ptr.pen.cursor && ptr.pen.pts.length > 0 && (
            <line x1={ptr.pen.pts[ptr.pen.pts.length - 1].x} y1={ptr.pen.pts[ptr.pen.pts.length - 1].y} x2={ptr.pen.cursor.x} y2={ptr.pen.cursor.y} strokeWidth={u} className="hb-cr-rubber" />
          )}
          {ptr.pen.pts.map((p, i) => <rect key={i} x={p.x - 3.5 * u} y={p.y - 3.5 * u} width={7 * u} height={7 * u} strokeWidth={u} className="hb-cr-anchor" />)}
        </g>
      )}
    </svg>
  );
}
