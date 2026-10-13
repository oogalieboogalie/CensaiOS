/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { FONTS } from '../../../lib/yorware/layoutFlow.js';
import { imageBox, lineEnds } from '../../../lib/yorware/layoutPlan.js';
import { LAYOUT_INK } from '../../../lib/yorware/layoutTemplates.js';

const painted = (c) => Boolean(c) && c !== 'none' && c !== 'transparent';

/**
 * One frame drawn as SVG in page points, from the same plan the PDF export
 * draws, so the page on screen is the page that prints. `guides` adds the
 * on-screen-only helpers: outlines of empty frames and picture placeholders.
 */
export function LayoutItem({ item, doc, guides = false }) {
  const { id, frame: f, text } = item;
  const paint = {
    fill: painted(f.fill) ? f.fill : 'none',
    stroke: painted(f.stroke) && (Number(f.sw) || 0) > 0 ? f.stroke : 'none',
    strokeWidth: painted(f.stroke) ? Number(f.sw) || 0 : undefined,
    opacity: f.opacity ?? undefined,
  };
  const box = { x: f.x, y: f.y, width: Math.max(0, f.w), height: Math.max(0, f.h) };
  const common = { 'data-frame': id, 'data-master': item.master ? 'true' : undefined, 'data-type': f.type };

  if (f.type === 'rect') return <rect {...common} {...box} {...paint} />;
  if (f.type === 'ellipse') return <ellipse {...common} cx={f.x + f.w / 2} cy={f.y + f.h / 2} rx={f.w / 2} ry={f.h / 2} {...paint} />;
  if (f.type === 'line') {
    const e = lineEnds(f);
    return (
      <g {...common}>
        <line {...e} stroke={paint.stroke === 'none' ? 'transparent' : paint.stroke} strokeWidth={Number(f.sw) || 1} strokeLinecap="round" opacity={paint.opacity} />
        {guides && <line {...e} stroke="transparent" strokeWidth={10} className="hb-yl-hit" />}
      </g>
    );
  }
  if (f.type === 'image') {
    const img = f.img ? doc.images[f.img] : null;
    const b = img ? imageBox(f, img) : null;
    return (
      <g {...common}>
        {(paint.fill !== 'none' || paint.stroke !== 'none') && <rect {...box} {...paint} />}
        {img ? (
          <svg x={f.x} y={f.y} width={box.width} height={box.height} viewBox={`${f.x} ${f.y} ${box.width} ${box.height}`} overflow="hidden">
            <image href={`data:${img.mime};base64,${img.data}`} x={b.x} y={b.y} width={b.w} height={b.h} preserveAspectRatio="none" opacity={paint.opacity} />
          </svg>
        ) : guides && (
          <g className="hb-yl-placeholder">
            <rect {...box} />
            <path d={`M${f.x} ${f.y}L${f.x + f.w} ${f.y + f.h}M${f.x + f.w} ${f.y}L${f.x} ${f.y + f.h}`} />
            {f.w > 120 && f.h > 40 && <text x={f.x + f.w / 2} y={f.y + f.h / 2 + 5} textAnchor="middle">Drop a picture here</text>}
          </g>
        )}
      </g>
    );
  }
  // Text frame.
  const s = doc.stories[f.story] || {};
  const size = Math.max(4, Number(s.size) || 12);
  const empty = !text?.lines?.some((l) => l.text);
  return (
    <g {...common}>
      <rect {...box} fill={paint.fill} stroke={paint.stroke} strokeWidth={paint.strokeWidth} />
      {guides && <rect {...box} className="hb-yl-textbox" />}
      <text fontFamily={(FONTS[s.font] || FONTS.sans).css} fontSize={size} fontWeight={s.bold ? 700 : 400} fill={s.color || LAYOUT_INK.black}
        opacity={paint.opacity} xmlSpace="preserve" className="hb-yl-text">
        {(text?.lines || []).map((l, i) => (l.text ? <tspan key={i} x={l.x} y={l.y}>{l.text}</tspan> : null))}
      </text>
      {guides && empty && f.w > 60 && <text x={f.x + 6} y={f.y + 16} className="hb-yl-ghost">{text?.index ? 'Text continues here' : 'Type in the panel'}</text>}
    </g>
  );
}

/** A small, read-only picture of a page, for the page strip. */
export function LayoutThumb({ doc, items, scale, label }) {
  return (
    <svg className="hb-yl-thumb-svg" width={doc.w * scale} height={doc.h * scale} viewBox={`0 0 ${doc.w} ${doc.h}`} role="img" aria-label={label}>
      <rect width={doc.w} height={doc.h} className="hb-yl-paper" />
      {items.map((item) => <LayoutItem key={item.id} item={item} doc={doc} />)}
    </svg>
  );
}
