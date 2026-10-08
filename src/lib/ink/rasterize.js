// Turn a sketch (canvas ink strokes and/or Sketchpad elements) into a PNG a
// vision model can read or the clipboard can hold. sceneSvg is pure; the PNG
// step needs a browser.
import { getSvgPathFromStroke } from '../../components/canvas/CanvasInteractions.js';
import { inkPath, isInkStroke } from './stroke.js';

export const DEFAULT_INK = 'oklch(var(--accent-l) calc(var(--accent-c) * 1) var(--accent-h))';
const MAX_EDGE = 1600;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** A Sketchpad pencil element seen as an ink stroke. */
export function pencilAsStroke(el) {
  return { id: el.id, pts: el.pts || [], size: (el.strokeWidth || 3) * 1.6, sim: !el.pen, color: el.color };
}

function elementBounds(el) {
  if (Array.isArray(el.pts) && el.pts.length) {
    const xs = el.pts.map((p) => p.x); const ys = el.pts.map((p) => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  if (el.type === 'text') return { x: el.x, y: el.y, w: Math.max(40, String(el.text || '').length * 8), h: 18 };
  return { x: Math.min(el.x, el.x + el.w), y: Math.min(el.y, el.y + el.h), w: Math.abs(el.w || 0), h: Math.abs(el.h || 0) };
}

export function sceneBounds({ strokes = [], elements = [] }) {
  const boxes = [
    ...strokes.map((s) => { const pad = (s.size || 3) / 2; const b = elementBounds({ pts: s.pts }); return { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 }; }),
    ...elements.map((el) => { const b = elementBounds(el); const pad = (el.strokeWidth || 2) / 2; return { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 }; }),
  ];
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map((b) => b.x)); const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
}

function strokeMarkup(stroke, color) {
  if (isInkStroke(stroke)) {
    return `<path d="${inkPath(stroke)}" fill="${esc(color(stroke.color))}"/>`;
  }
  return `<path d="${getSvgPathFromStroke(stroke.pts)}" fill="none" stroke="${esc(color(stroke.color))}" stroke-width="${stroke.size || 3}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function elementMarkup(el, color) {
  const c = esc(color(el.color));
  const sw = el.strokeWidth || 3;
  if (el.type === 'pencil') return `<path d="${inkPath(pencilAsStroke(el))}" fill="${c}"/>`;
  if (el.type === 'rect') return `<rect x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" fill="none" stroke="${c}" stroke-width="${sw}"/>`;
  if (el.type === 'circle') return `<ellipse cx="${el.x + el.w / 2}" cy="${el.y + el.h / 2}" rx="${Math.abs(el.w) / 2}" ry="${Math.abs(el.h) / 2}" fill="none" stroke="${c}" stroke-width="${sw}"/>`;
  if (el.type === 'arrow' && el.pts?.length >= 2) {
    const [p0] = el.pts; const p1 = el.pts[el.pts.length - 1];
    const a = Math.atan2(p1.y - p0.y, p1.x - p0.x);
    const head = [a - Math.PI / 6, a + Math.PI / 6].map((t) => `${p1.x - 12 * Math.cos(t)},${p1.y - 12 * Math.sin(t)}`).join(' ');
    return `<line x1="${p0.x}" y1="${p0.y}" x2="${p1.x}" y2="${p1.y}" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"/><polygon points="${p1.x},${p1.y} ${head}" fill="${c}"/>`;
  }
  if (el.type === 'text') return `<text x="${el.x}" y="${el.y + 12}" fill="${c}" font-size="14" font-family="sans-serif">${esc(el.text)}</text>`;
  if (el.type === 'image' && el.href) return `<image href="${esc(el.href)}" x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}"/>`;
  return '';
}

/**
 * SVG markup for the scene, cropped to its bounds plus padding.
 * `color` maps a stored color (possibly a CSS variable) to a literal one.
 */
export function sceneSvg({ strokes = [], elements = [], padding = 24, background = null, color = (c) => c || '#000' }) {
  const b = sceneBounds({ strokes, elements });
  if (!b) return null;
  const x = b.x - padding; const y = b.y - padding;
  const w = Math.max(1, b.w + padding * 2); const h = Math.max(1, b.h + padding * 2);
  const bg = background ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${esc(background)}"/>` : '';
  const body = [...elements.map((el) => elementMarkup(el, color)), ...strokes.map((s) => strokeMarkup(s, color))].join('');
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}">${bg}${body}</svg>`, width: w, height: h, bounds: b };
}

/** Resolve any CSS color (including var(...)) to a literal the SVG image can use. */
export function cssColorResolver(root = document.body) {
  const probe = document.createElement('span');
  probe.style.display = 'none';
  root.appendChild(probe);
  const memo = new Map();
  const resolve = (value) => {
    const key = value || DEFAULT_INK;
    if (!memo.has(key)) {
      probe.style.color = '';
      probe.style.color = key;
      memo.set(key, getComputedStyle(probe).color || '#000');
    }
    return memo.get(key);
  };
  resolve.dispose = () => probe.remove();
  return resolve;
}

/** Rasterize a scene to a PNG data URL on the board's own background color. */
export async function sceneToPng({ strokes = [], elements = [], padding = 24 } = {}) {
  const color = cssColorResolver();
  try {
    const background = color('var(--canvas, var(--surface))');
    const scene = sceneSvg({ strokes, elements, padding, background, color });
    if (!scene) return null;
    const scale = Math.min(2, MAX_EDGE / Math.max(scene.width, scene.height));
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(scene.svg)}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(scene.width * scale));
    canvas.height = Math.max(1, Math.round(scene.height * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL('image/png'), bounds: scene.bounds, width: canvas.width, height: canvas.height };
  } finally {
    color.dispose();
  }
}

/** Put a PNG data URL on the clipboard. Resolves false where the browser refuses. */
export async function copyPngToClipboard(dataUrl) {
  try {
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') return false;
    const blob = await (await fetch(dataUrl)).blob();
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch {
    return false;
  }
}
