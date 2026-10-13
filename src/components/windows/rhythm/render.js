// Draws the note highway: four lanes running toward you, notes sliding down
// to the frets at the bottom. Canvas 2D can't read token colors, so they are
// resolved through a hidden probe element first.
import { LANES } from '../../../lib/games/rhythm/sequence.js';

export const LOOK_AHEAD = 1.7;
const TOKENS = { bg: '--surface-sunken', road: '--surface', line: '--hairline', faint: '--ink-faint', ink: '--ink', l0: '--success', l1: '--danger', l2: '--warning', l3: '--accent' };

export function readColors(el) {
  const host = el?.parentElement || document.body;
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden';
  host.appendChild(probe);
  const out = {};
  for (const [key, token] of Object.entries(TOKENS)) {
    probe.style.color = `var(${token})`;
    out[key] = getComputedStyle(probe).color;
  }
  probe.remove();
  out.lanes = [out.l0, out.l1, out.l2, out.l3];
  return out;
}

/** Screen geometry for the highway at this canvas size. */
export function highway(width, height) {
  const top = height * 0.06;
  const hit = height * 0.84;
  const nearW = Math.min(width * 0.86, height * 1.05);
  const farW = nearW * 0.42;
  const cx = width / 2;
  const at = (depth) => {
    const y = top + (hit - top) * depth;
    const w = farW + (nearW - farW) * depth;
    return { y, w, left: cx - w / 2 };
  };
  return { top, hit, cx, at, nearW };
}

// Notes far away bunch up a little, like a road going over a hill.
const depthOf = (ahead) => (1 - Math.min(1, Math.max(-0.2, ahead / LOOK_AHEAD))) ** 1.35;

function laneX(row, lane) {
  return row.left + (row.w / LANES) * (lane + 0.5);
}

export function drawHighway(ctx, { width, height, colors, chart, hitIds, now, pressed, flashes }) {
  const c = colors;
  const h = highway(width, height);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, width, height);

  const far = h.at(0);
  const near = h.at(1.08);
  ctx.beginPath();
  ctx.moveTo(far.left, far.y);
  ctx.lineTo(far.left + far.w, far.y);
  ctx.lineTo(near.left + near.w, near.y);
  ctx.lineTo(near.left, near.y);
  ctx.closePath();
  ctx.fillStyle = c.road;
  ctx.fill();
  ctx.strokeStyle = c.line;
  ctx.lineWidth = 1;
  ctx.stroke();

  for (let i = 1; i < LANES; i += 1) {
    ctx.beginPath();
    ctx.moveTo(far.left + (far.w / LANES) * i, far.y);
    ctx.lineTo(near.left + (near.w / LANES) * i, near.y);
    ctx.stroke();
  }

  // Beat lines scroll with the song so the road feels like it moves.
  ctx.strokeStyle = c.line;
  const beat = 0.5;
  for (let b = Math.ceil(now / beat) * beat; b < now + LOOK_AHEAD; b += beat) {
    const row = h.at(depthOf(b - now));
    ctx.beginPath();
    ctx.moveTo(row.left, row.y);
    ctx.lineTo(row.left + row.w, row.y);
    ctx.stroke();
  }

  // Frets on the hit line.
  const hitRow = h.at(1);
  const fretR = (hitRow.w / LANES) * 0.3;
  for (let lane = 0; lane < LANES; lane += 1) {
    const x = laneX(hitRow, lane);
    ctx.beginPath();
    ctx.arc(x, hitRow.y, fretR, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = c.lanes[lane];
    ctx.stroke();
    if (pressed[lane]) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = c.lanes[lane];
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // Notes, far ones first so near ones draw on top.
  for (let i = chart.length - 1; i >= 0; i -= 1) {
    const note = chart[i];
    const ahead = note.t - now;
    if (ahead > LOOK_AHEAD || ahead < -0.25 || hitIds.has(note.id)) continue;
    const depth = depthOf(ahead);
    const row = h.at(depth);
    const x = laneX(row, note.lane);
    const r = (row.w / LANES) * 0.26;
    ctx.globalAlpha = ahead < -0.14 ? 0.35 : 1;
    ctx.beginPath();
    ctx.ellipse(x, row.y, r, r * 0.62, 0, 0, Math.PI * 2);
    ctx.fillStyle = c.lanes[note.lane];
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = c.road;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Hit flashes: a ring that grows and fades.
  for (const f of flashes) {
    const age = now - f.at;
    if (age < 0 || age > 0.25) continue;
    const x = laneX(hitRow, f.lane);
    ctx.globalAlpha = 1 - age / 0.25;
    ctx.beginPath();
    ctx.arc(x, hitRow.y, fretR * (1 + age * 4), 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = c.lanes[f.lane];
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
