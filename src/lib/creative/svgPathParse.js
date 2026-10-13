// SVG path data ("M10 10 C…") to Censai Vector subpaths. Every command,
// relative or absolute, becomes cubic bezier points, so an imported shape can
// be edited point by point like one drawn with the pen. Arcs are split into
// cubic pieces of at most 90 degrees.
import { corner } from './vectorGeom.js';

const ARGS = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };

function tokens(d) {
  return String(d || '').match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [];
}

/** Arc endpoint form to cubic segments: [[c1x, c1y, c2x, c2y, x, y], …]. */
export function arcToCubics(x1, y1, rxIn, ryIn, phiDeg, largeArc, sweep, x2, y2) {
  if (x1 === x2 && y1 === y2) return [];
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (!rx || !ry) return [[x1, y1, x2, y2, x2, y2]];
  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) { rx *= Math.sqrt(lambda); ry *= Math.sqrt(lambda); }
  const sign = largeArc === sweep ? -1 : 1;
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coef = sign * Math.sqrt(Math.max(0, num / den));
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const angle = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.ceil(Math.abs(dt) / (Math.PI / 2));
  const step = dt / n;
  const k = (4 / 3) * Math.tan(step / 4);
  const pt = (t) => [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos];
  const deriv = (t) => [-rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos];
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const a = t1 + i * step;
    const b = a + step;
    const [ax, ay] = pt(a);
    const [bx, by] = pt(b);
    const [dax, day] = deriv(a);
    const [dbx, dby] = deriv(b);
    out.push([ax + k * dax, ay + k * day, bx - k * dbx, by - k * dby, bx, by]);
  }
  return out;
}

/** Parse SVG path data into [{ pts, closed }]. */
export function parsePathData(d) {
  const tk = tokens(d);
  const subpaths = [];
  let sp = null;
  let x = 0; let y = 0; let sx = 0; let sy = 0;
  let prevCmd = ''; let lastCtrl = null;
  const start = (px, py) => { sp = { pts: [corner(px, py)], closed: false }; subpaths.push(sp); sx = px; sy = py; };
  const ensure = () => { if (!sp || sp.closed) start(x, y); };
  const cubic = (c1x, c1y, c2x, c2y, px, py) => {
    ensure();
    const last = sp.pts[sp.pts.length - 1];
    last.ox = c1x; last.oy = c1y;
    sp.pts.push({ x: px, y: py, ix: c2x, iy: c2y, ox: px, oy: py });
    x = px; y = py;
  };
  let i = 0;
  let cmd = '';
  while (i < tk.length) {
    if (/[a-zA-Z]/.test(tk[i])) { cmd = tk[i]; i += 1; } else if (!cmd) break;
    const lower = cmd.toLowerCase();
    const rel = cmd !== cmd.toUpperCase();
    const n = ARGS[lower];
    if (n === undefined) break;
    if (lower === 'z') {
      if (sp && sp.pts.length > 1) {
        const first = sp.pts[0];
        const last = sp.pts[sp.pts.length - 1];
        if (Math.abs(last.x - first.x) < 1e-6 && Math.abs(last.y - first.y) < 1e-6) { first.ix = last.ix; first.iy = last.iy; sp.pts.pop(); }
        sp.closed = true;
      }
      x = sx; y = sy; prevCmd = 'z'; lastCtrl = null;
      continue;
    }
    const a = tk.slice(i, i + n).map(Number);
    if (a.length < n || a.some((v) => Number.isNaN(v))) break;
    i += n;
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    let ctrl = null;
    if (lower === 'm') {
      start(a[0] + ox, a[1] + oy); x = sx; y = sy;
      cmd = rel ? 'l' : 'L';
    } else if (lower === 'l') { ensure(); sp.pts.push(corner(a[0] + ox, a[1] + oy)); x = a[0] + ox; y = a[1] + oy; }
    else if (lower === 'h') { ensure(); x = a[0] + (rel ? x : 0); sp.pts.push(corner(x, y)); }
    else if (lower === 'v') { ensure(); y = a[0] + (rel ? y : 0); sp.pts.push(corner(x, y)); }
    else if (lower === 'c') { ctrl = [a[2] + ox, a[3] + oy]; cubic(a[0] + ox, a[1] + oy, ctrl[0], ctrl[1], a[4] + ox, a[5] + oy); }
    else if (lower === 's') {
      const r = /[cs]/.test(prevCmd) && lastCtrl ? [2 * x - lastCtrl[0], 2 * y - lastCtrl[1]] : [x, y];
      ctrl = [a[0] + ox, a[1] + oy];
      cubic(r[0], r[1], ctrl[0], ctrl[1], a[2] + ox, a[3] + oy);
    } else if (lower === 'q' || lower === 't') {
      const q = lower === 'q' ? [a[0] + ox, a[1] + oy] : (/[qt]/.test(prevCmd) && lastCtrl ? [2 * x - lastCtrl[0], 2 * y - lastCtrl[1]] : [x, y]);
      const px = (lower === 'q' ? a[2] : a[0]) + ox;
      const py = (lower === 'q' ? a[3] : a[1]) + oy;
      ctrl = q;
      cubic(x + (2 / 3) * (q[0] - x), y + (2 / 3) * (q[1] - y), px + (2 / 3) * (q[0] - px), py + (2 / 3) * (q[1] - py), px, py);
    } else if (lower === 'a') {
      for (const c of arcToCubics(x, y, a[0], a[1], a[2], a[3] ? 1 : 0, a[4] ? 1 : 0, a[5] + ox, a[6] + oy)) cubic(...c);
      x = a[5] + ox; y = a[6] + oy;
    }
    prevCmd = lower;
    lastCtrl = ctrl;
  }
  return subpaths.filter((s) => s.pts.length > 1 || s.closed);
}
