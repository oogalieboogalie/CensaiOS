// The "swirl" mode for the Music window's visualizer, after the early Windows
// Media Player effects: each frame the last picture is turned and zoomed a
// little, so colour pours outward in a spiral, and a ring of petals in the
// skin's colours pulses with the band levels (the real sound when the player
// can read it, the made-up beat otherwise). `still` draws one calm frame with
// no trails, for paused players and reduced motion.

function average(levels, from, to) {
  let sum = 0;
  for (let i = from; i < to; i++) sum += levels[i];
  return sum / Math.max(1, to - from);
}

/** Bass, mids and treble in [0, 1] from the band levels. */
export function swirlEnergy(levels) {
  const n = levels.length;
  const third = Math.max(1, Math.floor(n / 3));
  return {
    bass: average(levels, 0, third),
    mid: average(levels, third, Math.min(n, third * 2)),
    treble: average(levels, Math.min(n, third * 2), n),
  };
}

/** How far the old frame turns (radians) and grows each frame. */
export function swirlFeedback({ bass, treble }) {
  return { turn: 0.025 + bass * 0.06 + treble * 0.02, zoom: 1.015 + bass * 0.035 };
}

function pourBack(ctx, w, h, feedback) {
  const canvas = ctx.canvas;
  if (!canvas || !canvas.width) return;
  const dpr = canvas.width / w;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // Replace the frame with a turned, zoomed and slightly faded copy of
  // itself, so trails spiral outward and die away instead of piling up.
  ctx.globalCompositeOperation = 'copy';
  ctx.globalAlpha = 0.9;
  ctx.translate((w * dpr) / 2, (h * dpr) / 2);
  ctx.rotate(feedback.turn);
  ctx.scale(feedback.zoom, feedback.zoom);
  ctx.drawImage(canvas, -(w * dpr) / 2, -(h * dpr) / 2);
  ctx.restore();
}

function drawPetals(ctx, w, h, levels, t, skin, energy) {
  const n = levels.length;
  const cx = w / 2;
  const cy = h / 2;
  const base = Math.min(w, h) * 0.12;
  const reach = Math.min(w, h) * 0.34;
  for (let ring = 0; ring < 3; ring++) {
    ctx.fillStyle = skin.vis[ring];
    ctx.globalAlpha = 0.22 + energy.mid * 0.3;
    const spin = t * (0.7 + ring * 0.35) * (ring % 2 ? -1 : 1);
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const k = i % n;
      const ang = (k / n) * Math.PI * 2 + spin;
      const r = base * (0.5 + ring * 0.35) + levels[k] * reach * (1 - ring * 0.22);
      const x = cx + Math.cos(ang) * r * 1.3;
      const y = cy + Math.sin(ang) * r * 0.9;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }
  // A bright core that throbs with the bass.
  ctx.globalAlpha = 0.2 + energy.bass * 0.4;
  ctx.fillStyle = skin.peak || skin.vis[2];
  ctx.beginPath();
  ctx.arc(cx, cy, base * (0.35 + energy.bass * 0.9), 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

export function drawSwirl(ctx, w, h, levels, t, skin, { still = false } = {}) {
  const energy = swirlEnergy(levels);
  if (still) ctx.clearRect(0, 0, w, h);
  else pourBack(ctx, w, h, swirlFeedback(energy));
  drawPetals(ctx, w, h, levels, t, skin, energy);
}
