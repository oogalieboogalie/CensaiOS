// Drawing the race on a 2D canvas. The road is the drawn line made wide,
// the infield and outfield are grass, and everything takes the board's own
// colours: the accent is your car, ink is everyone else's.

import { CAR } from '../../../lib/games/racetrack/car.js';

const COLOR_TOKENS = {
  accent: 'var(--accent)',
  ink: 'var(--ink)',
  inkSoft: 'var(--ink-soft)',
  inkFaint: 'var(--ink-faint)',
  road: 'color-mix(in oklab, var(--ink) 16%, var(--surface-sunken))',
  grass: 'color-mix(in oklab, var(--canvas-pen-green) 26%, var(--surface-sunken))',
  grassDeep: 'color-mix(in oklab, var(--canvas-pen-green) 34%, var(--surface-sunken))',
  kerb: 'var(--surface)',
  paint: 'color-mix(in oklab, var(--surface) 70%, transparent)',
  shadow: 'color-mix(in oklab, black 30%, transparent)',
};

/** Theme colours as plain values a 2D canvas understands (resolved through a probe). */
export function readRaceColors(el) {
  const host = el?.parentElement || document.body;
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden';
  host.appendChild(probe);
  const out = {};
  for (const [key, value] of Object.entries(COLOR_TOKENS)) {
    probe.style.color = '';
    probe.style.color = value;
    out[key] = getComputedStyle(probe).color;
  }
  out.font = getComputedStyle(host).getPropertyValue('--font-sans').trim() || 'sans-serif';
  probe.remove();
  return out;
}

/** World-to-screen fit: the whole track in view, centred. */
export function fitView(world, width, height, pad = 12) {
  const scale = Math.min((width - pad * 2) / world.w, (height - pad * 2) / world.h);
  return { scale, ox: (width - world.w * scale) / 2, oy: (height - world.h * scale) / 2 };
}

function loopPath(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

// The static picture (grass, road, kerbs, start line) only changes with the
// track, the size or the theme, so it is drawn once into an offscreen canvas.
function drawCourse(ctx, track, colors) {
  const { pts, width, start } = track;
  ctx.fillStyle = colors.grass;
  ctx.fillRect(0, 0, track.world.w, track.world.h);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // A darker band right off the road reads as rough grass.
  ctx.strokeStyle = colors.grassDeep;
  ctx.lineWidth = width + 26;
  loopPath(ctx, pts);
  ctx.stroke();
  // Kerbs: a striped band either side of the tarmac.
  ctx.strokeStyle = colors.kerb;
  ctx.lineWidth = width + 8;
  loopPath(ctx, pts);
  ctx.stroke();
  ctx.strokeStyle = colors.accent;
  ctx.setLineDash([14, 14]);
  loopPath(ctx, pts);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = colors.road;
  ctx.lineWidth = width;
  loopPath(ctx, pts);
  ctx.stroke();
  // Centre line.
  ctx.strokeStyle = colors.paint;
  ctx.lineWidth = 2;
  ctx.setLineDash([16, 20]);
  loopPath(ctx, pts);
  ctx.stroke();
  ctx.setLineDash([]);
  // Chequered start line across the road at the first point of the stroke.
  ctx.save();
  ctx.translate(start.x, start.y);
  ctx.rotate(start.angle);
  const cell = 6;
  const rows = Math.ceil(width / cell);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < 2; c += 1) {
      ctx.fillStyle = (r + c) % 2 ? colors.ink : colors.kerb;
      ctx.fillRect(c * cell - cell, -width / 2 + r * cell, cell, Math.min(cell, width - r * cell));
    }
  }
  ctx.restore();
}

function drawCar(ctx, car, color, colors, { label, self }) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.a);
  const L = CAR.length;
  const W = CAR.width;
  ctx.fillStyle = colors.shadow;
  ctx.beginPath();
  ctx.roundRect(-L / 2 + 2, -W / 2 + 3, L, W, 4);
  ctx.fill();
  // Wheels.
  ctx.fillStyle = colors.ink;
  for (const [x, y] of [[-L * 0.3, -W / 2 - 1.5], [L * 0.28, -W / 2 - 1.5], [-L * 0.3, W / 2 - 1.5], [L * 0.28, W / 2 - 1.5]]) ctx.fillRect(x - 3, y, 6, 3);
  // Body, cabin and a nose stripe so the heading is obvious.
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(-L / 2, -W / 2, L, W, 4);
  ctx.fill();
  ctx.fillStyle = colors.road;
  ctx.beginPath();
  ctx.roundRect(-L * 0.12, -W / 2 + 2.5, L * 0.32, W - 5, 2);
  ctx.fill();
  ctx.fillStyle = colors.kerb;
  ctx.fillRect(L / 2 - 4, -1.5, 3, 3);
  ctx.restore();
  if (label) {
    ctx.save();
    ctx.font = `600 11px ${colors.font}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = self ? colors.accent : colors.inkSoft;
    ctx.fillText(label, car.x, car.y - 22);
    ctx.restore();
  }
}

/** Remember where tyres slid, so drifts leave marks (joined while the slide lasts). */
export function addSkid(skids, car, now) {
  if (car.slip < 70) { skids.last = null; return; }
  const back = { x: car.x - Math.cos(car.a) * CAR.length * 0.3, y: car.y - Math.sin(car.a) * CAR.length * 0.3 };
  const side = { x: -Math.sin(car.a) * CAR.width * 0.45, y: Math.cos(car.a) * CAR.width * 0.45 };
  const mark = { x1: back.x + side.x, y1: back.y + side.y, x2: back.x - side.x, y2: back.y - side.y };
  const prev = skids.last && now - skids.last.at < 60 ? skids.last : mark;
  skids.push({ ...mark, px1: prev.x1, py1: prev.y1, px2: prev.x2, py2: prev.y2, at: now, k: Math.min(1, car.slip / 220) });
  skids.last = { ...mark, at: now };
  if (skids.length > 900) skids.splice(0, skids.length - 900);
}

/**
 * One frame. `course` is a cache object the caller keeps between frames;
 * `me` is your car, `rivals` everyone else's.
 */
export function drawRace(ctx, { track, me, rivals, skids, colors, width, height, dpr, course, now, selfLabel }) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = colors.grass;
  ctx.fillRect(0, 0, width, height);
  if (!track) return;
  const view = fitView(track.world, width, height, 10 * dpr);
  const key = `${width}x${height}:${track.length}:${colors.accent}:${colors.grass}`;
  if (course.key !== key) {
    course.key = key;
    course.canvas = course.canvas || document.createElement('canvas');
    course.canvas.width = width;
    course.canvas.height = height;
    const c = course.canvas.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = colors.grass;
    c.fillRect(0, 0, width, height);
    c.setTransform(view.scale, 0, 0, view.scale, view.ox, view.oy);
    drawCourse(c, track, colors);
  }
  ctx.drawImage(course.canvas, 0, 0);
  ctx.setTransform(view.scale, 0, 0, view.scale, view.ox, view.oy);
  // Skid marks fade over a few seconds.
  ctx.lineCap = 'round';
  ctx.lineWidth = 2.4;
  for (const s of skids) {
    const age = (now - s.at) / 4000;
    if (age >= 1) continue;
    ctx.globalAlpha = (1 - age) * 0.45 * s.k;
    ctx.strokeStyle = colors.ink;
    ctx.beginPath();
    ctx.moveTo(s.px1, s.py1);
    ctx.lineTo(s.x1 + 0.01, s.y1);
    ctx.moveTo(s.px2, s.py2);
    ctx.lineTo(s.x2 + 0.01, s.y2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const rival of rivals) drawCar(ctx, rival, colors.inkSoft, colors, { label: rival.name });
  if (me) drawCar(ctx, me, colors.accent, colors, { label: rivals.length ? selfLabel : null, self: true });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
