// Censai Vector shapes as SVG. The editor draws each shape from the same
// description the exported .svg file uses, so the file matches the screen.
import { pathD, textLines } from './vectorGeom.js';

export const TEXT_FONT = 'Inter, Helvetica Neue, Arial, sans-serif';

/** { tag, attrs, lines? } for one shape. */
export function shapeSvg(s) {
  const paint = {
    fill: s.type === 'line' ? 'none' : s.fill || 'none',
    stroke: s.stroke && s.stroke !== 'none' ? s.stroke : 'none',
    'stroke-width': s.stroke && s.stroke !== 'none' ? s.sw || 1 : undefined,
    'stroke-linecap': s.type === 'line' || s.type === 'path' ? 'round' : undefined,
    'stroke-linejoin': s.type === 'path' ? 'round' : undefined,
    opacity: s.opacity !== undefined && s.opacity !== 1 ? s.opacity : undefined,
  };
  if (s.type === 'rect') return { tag: 'rect', attrs: { x: s.x, y: s.y, width: s.w, height: s.h, rx: s.rx || undefined, ...paint } };
  if (s.type === 'ellipse') return { tag: 'ellipse', attrs: { cx: s.x + s.w / 2, cy: s.y + s.h / 2, rx: s.w / 2, ry: s.h / 2, ...paint } };
  if (s.type === 'line') return { tag: 'line', attrs: { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, ...paint } };
  if (s.type === 'text') {
    const size = s.size || 32;
    return {
      tag: 'text',
      attrs: { x: s.x, y: s.y + size * 0.8, 'font-family': TEXT_FONT, 'font-size': size, 'font-weight': s.weight || 600, ...paint },
      lines: textLines(s).map((t, i) => ({ t, dy: i === 0 ? 0 : size * 1.2 })),
    };
  }
  return { tag: 'path', attrs: { d: pathD(s), 'fill-rule': s.fillRule || undefined, ...paint } };
}

const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);

function attrString(attrs) {
  return Object.entries(attrs).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => ` ${k}="${esc(num(v))}"`).join('');
}

function shapeString(s, indent) {
  const { tag, attrs, lines } = shapeSvg(s);
  if (!lines) return `${indent}<${tag}${attrString(attrs)}/>`;
  const spans = lines.map((l) => `<tspan x="${num(attrs.x)}" dy="${num(l.dy)}">${esc(l.t)}</tspan>`).join('');
  return `${indent}<${tag}${attrString(attrs)}>${spans}</${tag}>`;
}

/** The artboard as a standalone .svg document. Groups become <g> elements. */
export function vectorToSvg(doc) {
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${doc.w}" height="${doc.h}" viewBox="0 0 ${doc.w} ${doc.h}">`];
  if (doc.bg) out.push(`  <rect width="100%" height="100%" fill="${esc(doc.bg)}"/>`);
  let open = null;
  for (const id of doc.order) {
    const s = doc.shapes[id];
    if (!s) continue;
    const g = s.group || null;
    if (g !== open) {
      if (open) out.push('  </g>');
      if (g) out.push(`  <g id="${esc(g)}">`);
      open = g;
    }
    out.push(shapeString(s, g ? '    ' : '  '));
  }
  if (open) out.push('  </g>');
  out.push('</svg>');
  return `${out.join('\n')}\n`;
}

/** Browser only: the artboard as a PNG Blob at `scale`× size. */
export async function vectorToPng(doc, scale = 2) {
  const svg = vectorToSvg(doc);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Could not draw the artboard.'));
      i.src = url;
    });
    const c = document.createElement('canvas');
    c.width = Math.round(doc.w * scale);
    c.height = Math.round(doc.h * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not make the PNG.'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}
