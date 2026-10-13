// Import an .svg file into Censai Vector. Shapes come in as editable paths
// (text stays text), with transforms baked in and styles resolved from the
// element, its groups and inline `style`. Gradients and patterns come in as
// their first color; filters, masks and clip paths are left out.
import { corner, matrixShape, toPath } from './vectorGeom.js';
import { parsePathData } from './svgPathParse.js';

const IDENTITY = [1, 0, 0, 1, 0, 0];

export function multiply(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

/** An SVG `transform` attribute as one matrix. */
export function parseTransform(str) {
  let m = IDENTITY;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let hit;
  while ((hit = re.exec(String(str || '')))) {
    const v = (hit[2].match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || []).map(Number);
    let n = IDENTITY;
    if (hit[1] === 'matrix' && v.length === 6) n = v;
    else if (hit[1] === 'translate') n = [1, 0, 0, 1, v[0] || 0, v[1] || 0];
    else if (hit[1] === 'scale') n = [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0];
    else if (hit[1] === 'rotate') {
      const a = ((v[0] || 0) * Math.PI) / 180;
      const r = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
      n = v.length >= 3 ? multiply(multiply([1, 0, 0, 1, v[1], v[2]], r), [1, 0, 0, 1, -v[1], -v[2]]) : r;
    } else if (hit[1] === 'skewX') n = [1, 0, Math.tan(((v[0] || 0) * Math.PI) / 180), 1, 0, 0];
    else if (hit[1] === 'skewY') n = [1, Math.tan(((v[0] || 0) * Math.PI) / 180), 0, 1, 0, 0];
    m = multiply(m, n);
  }
  return m;
}

function styleOf(el) {
  const out = {};
  for (const name of ['fill', 'stroke', 'stroke-width', 'opacity', 'font-size', 'font-weight', 'fill-rule', 'display']) {
    const v = el.getAttribute(name);
    if (v !== null && v !== '') out[name] = v.trim();
  }
  for (const part of String(el.getAttribute('style') || '').split(';')) {
    const [k, ...rest] = part.split(':');
    if (k && rest.length) out[k.trim()] = rest.join(':').trim();
  }
  return out;
}

const n = (v, d = 0) => { const x = parseFloat(v); return Number.isFinite(x) ? x : d; };

function resolvePaint(value, root) {
  if (!value || value === 'none' || value === 'transparent') return 'none';
  if (value === 'currentColor') return '#000000';
  const ref = /^url\(\s*#([^)\s]+)\s*\)/.exec(value);
  if (ref) {
    const stop = root.querySelector(`[id="${ref[1]}"] stop`);
    const color = stop && (styleOf(stop)['stop-color'] || stop.getAttribute('stop-color'));
    return color || '#888888';
  }
  return value;
}

function geometry(el, tag) {
  const a = (k) => n(el.getAttribute(k));
  if (tag === 'rect') return toPath({ type: 'rect', x: a('x'), y: a('y'), w: a('width'), h: a('height'), rx: a('rx') || a('ry') });
  if (tag === 'circle') return toPath({ type: 'ellipse', x: a('cx') - a('r'), y: a('cy') - a('r'), w: a('r') * 2, h: a('r') * 2 });
  if (tag === 'ellipse') return toPath({ type: 'ellipse', x: a('cx') - a('rx'), y: a('cy') - a('ry'), w: a('rx') * 2, h: a('ry') * 2 });
  if (tag === 'line') return toPath({ type: 'line', x1: a('x1'), y1: a('y1'), x2: a('x2'), y2: a('y2') });
  if (tag === 'polyline' || tag === 'polygon') {
    const v = (String(el.getAttribute('points') || '').match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || []).map(Number);
    const pts = [];
    for (let i = 0; i + 1 < v.length; i += 2) pts.push(corner(v[i], v[i + 1]));
    return { type: 'path', subpaths: [{ pts, closed: tag === 'polygon' }] };
  }
  if (tag === 'path') return { type: 'path', subpaths: parsePathData(el.getAttribute('d')) };
  return null;
}

/**
 * Parse SVG text into { w, h, shapes }. `parser` is a DOMParser (passed in so
 * tests can use jsdom's). Each top-level <g> becomes one group.
 */
export function importSvg(text, parser, newGroupId = () => `g${Math.random().toString(36).slice(2, 8)}`) {
  const xml = parser.parseFromString(String(text || ''), 'image/svg+xml');
  const root = xml.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg' || xml.getElementsByTagName('parsererror').length) throw new Error('That file is not an SVG this editor can read.');
  const vb = String(root.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
  const hasVb = vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0;
  const w = hasVb ? vb[2] : n(root.getAttribute('width'), 800);
  const h = hasVb ? vb[3] : n(root.getAttribute('height'), 600);
  const base = hasVb ? [1, 0, 0, 1, -vb[0], -vb[1]] : IDENTITY;
  const shapes = [];
  const walk = (el, m, inherited, group, depth) => {
    const tag = el.nodeName.toLowerCase().replace(/^svg:/, '');
    if (['defs', 'clippath', 'mask', 'pattern', 'lineargradient', 'radialgradient', 'filter', 'symbol', 'style', 'title', 'desc', 'metadata'].includes(tag)) return;
    const style = { ...inherited, ...styleOf(el) };
    if (style.display === 'none') return;
    const mm = multiply(m, parseTransform(el.getAttribute('transform')));
    const opacity = n(inherited.opacity, 1) * n(styleOf(el).opacity, 1);
    if (tag === 'g' || tag === 'svg' || tag === 'a') {
      const g = depth === 0 && tag === 'g' ? newGroupId() : group;
      for (const child of Array.from(el.children)) walk(child, mm, { ...style, opacity: String(opacity) }, g, depth + 1);
      return;
    }
    const paint = {
      fill: resolvePaint(style.fill ?? '#000000', xml),
      stroke: resolvePaint(style.stroke ?? 'none', xml),
      sw: n(style['stroke-width'], 1),
      opacity: Math.round(opacity * 1000) / 1000,
      group: group || null,
    };
    if (tag === 'text') {
      const size = n(style['font-size'], 16);
      const x = n(el.getAttribute('x'));
      const y = n(el.getAttribute('y'));
      const tx = mm[0] * x + mm[2] * y + mm[4];
      const ty = mm[1] * x + mm[3] * y + mm[5];
      const scale = Math.sqrt(Math.abs(mm[0] * mm[3] - mm[1] * mm[2])) || 1;
      const content = (el.textContent || '').trim();
      if (content) shapes.push({ type: 'text', text: content, x: tx, y: ty - size * scale * 0.8, size: size * scale, weight: n(style['font-weight'], 400) || 400, ...paint, stroke: 'none' });
      return;
    }
    const geo = geometry(el, tag);
    if (!geo || !(geo.subpaths || []).length) return;
    if (style['fill-rule'] === 'evenodd') geo.fillRule = 'evenodd';
    shapes.push(matrixShape({ ...geo, ...paint }, mm));
  };
  for (const child of Array.from(root.children)) walk(child, base, {}, null, 0);
  return { w: Math.round(w), h: Math.round(h), shapes };
}
