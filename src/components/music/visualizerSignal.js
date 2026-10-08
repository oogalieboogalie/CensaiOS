// Signal + drawing routines for the Music window's Windows-Media-Player style
// visualizer. Streams play inside cross-origin iframes (YouTube, Spotify,
// SoundCloud), so the browser never lets us read their audio samples. The
// visualizer instead synthesizes a beat-locked spectrum from the track seed
// and the real play/pause state: each track gets its own tempo and shape, it
// moves only while the stream is actually playing, and it decays to rest on
// pause.

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function hashNoise(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function tempoForSeed(seed) {
  return 84 + (seed % 45);
}

/**
 * Fill `out` with `out.length` band levels in [0, 1] for time `t` seconds.
 * Low bands ride the kick, high bands ride an off-beat hi-hat, mids drift.
 */
export function synthSpectrum(t, seed, out) {
  const n = out.length;
  const bpm = tempoForSeed(seed);
  const beat = (t * bpm) / 60;
  const kick = Math.exp(-(beat % 1) * 6.5);
  const snare = Math.exp(-((beat + 0.5) % 2) * 5) * 0.6;
  const hat = Math.exp(-((beat * 2 + 0.5) % 1) * 11);
  const swell = 0.75 + 0.25 * Math.sin(t * 0.21 + (seed % 17));
  const step = Math.floor(beat * 4);
  for (let i = 0; i < n; i++) {
    const x = n > 1 ? i / (n - 1) : 0;
    const phase = ((seed >>> (i % 24)) & 255) / 40;
    const low = Math.pow(1 - x, 1.6) * 0.62 * kick;
    const mid = Math.exp(-Math.pow((x - 0.45) * 3.2, 2)) * (0.32 * snare + 0.18 * (0.5 + 0.5 * Math.sin(t * (1.7 + x * 4.3) + phase)));
    const high = Math.pow(x, 1.4) * 0.38 * hat;
    const drift = 0.16 * (0.5 + 0.5 * Math.sin(t * (0.9 + x * 2.6) + phase * 1.7));
    const jitter = 0.12 * hashNoise(step * 31 + i * 7 + (seed % 101));
    const raw = (low + mid + high + drift + jitter) * swell * (0.92 + 0.08 * (1 - x));
    // Soft-clip gain so the meters swing through most of the screen.
    out[i] = clamp01(1 - Math.exp(-2.4 * raw));
  }
  return out;
}

function lerpColor(stops, t) {
  return stops[Math.min(stops.length - 1, Math.max(0, Math.round(t * (stops.length - 1))))];
}

export function drawBars(ctx, w, h, levels, peaks, skin) {
  ctx.clearRect(0, 0, w, h);
  const n = levels.length;
  const gap = Math.max(2, Math.round(w / n / 4));
  const bw = (w - gap * (n + 1)) / n;
  const floor = Math.round(h * 0.78);
  const seg = Math.max(3, Math.round(floor / 16));
  const grad = ctx.createLinearGradient(0, floor, 0, 0);
  grad.addColorStop(0, skin.vis[0]);
  grad.addColorStop(0.6, skin.vis[1]);
  grad.addColorStop(1, skin.vis[2]);
  ctx.shadowColor = skin.lcdGlow;
  ctx.shadowBlur = 8;
  for (let i = 0; i < n; i++) {
    const x = gap + i * (bw + gap);
    const bh = Math.max(seg * 0.5, levels[i] * (floor - 4));
    const segments = Math.max(1, Math.floor(bh / seg));
    ctx.fillStyle = grad;
    for (let s = 0; s < segments; s++) {
      ctx.fillRect(x, floor - (s + 1) * seg + 1, bw, seg - 1.5);
    }
    // Falling peak caps.
    ctx.fillStyle = skin.peak;
    ctx.fillRect(x, floor - peaks[i] * (floor - 4) - 3, bw, 2);
  }
  // Mirrored "waves" reflection under the floor line.
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.22;
  for (let i = 0; i < n; i++) {
    const x = gap + i * (bw + gap);
    const rh = levels[i] * (h - floor - 2);
    ctx.fillStyle = skin.vis[0];
    ctx.fillRect(x, floor + 2, bw, rh);
  }
  ctx.globalAlpha = 1;
}

export function drawScope(ctx, w, h, levels, t, skin) {
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = skin.lcdDim;
  ctx.globalAlpha = 0.25;
  ctx.lineWidth = 1;
  for (let gx = 0; gx <= 8; gx++) {
    ctx.beginPath(); ctx.moveTo((gx / 8) * w, 0); ctx.lineTo((gx / 8) * w, h); ctx.stroke();
  }
  for (let gy = 0; gy <= 4; gy++) {
    ctx.beginPath(); ctx.moveTo(0, (gy / 4) * h); ctx.lineTo(w, (gy / 4) * h); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const n = levels.length;
  const mid = h / 2;
  const traces = [
    { color: skin.vis[1], width: 2.2, offset: 0, scale: 1 },
    { color: skin.vis[2], width: 1, offset: 1.3, scale: 0.55 },
  ];
  ctx.shadowColor = skin.lcdGlow;
  ctx.shadowBlur = 10;
  for (const trace of traces) {
    ctx.strokeStyle = trace.color;
    ctx.lineWidth = trace.width;
    ctx.beginPath();
    for (let px = 0; px <= w; px += 2) {
      const u = px / w;
      let y = 0;
      for (let k = 0; k < n; k += 3) {
        y += levels[k] * Math.sin(u * Math.PI * 2 * (1 + k * 0.6) + t * (3 + k * 0.4) + trace.offset) / (1 + k * 0.15);
      }
      const v = mid + (y / Math.max(1, n / 3)) * h * 0.9 * trace.scale;
      if (px === 0) ctx.moveTo(px, v); else ctx.lineTo(px, v);
    }
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
}

export function drawAmbience(ctx, w, h, levels, t, skin) {
  // Trails: fade the previous frame toward transparent instead of clearing.
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'lighter';
  const n = levels.length;
  let bass = 0;
  let treble = 0;
  for (let i = 0; i < n; i++) {
    if (i < n / 3) bass += levels[i]; else treble += levels[i];
  }
  bass /= Math.max(1, n / 3);
  treble /= Math.max(1, (2 * n) / 3);
  const cx = w / 2;
  const cy = h / 2;
  const base = Math.min(w, h) * 0.18;
  const arms = 5;
  for (let a = 0; a < arms; a++) {
    ctx.strokeStyle = lerpColor(skin.vis, a / (arms - 1));
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let s = 0; s <= 120; s++) {
      const u = s / 120;
      const ang = u * Math.PI * 2 * 2 + t * (0.6 + a * 0.13) + (a * Math.PI * 2) / arms;
      const r = base * (0.6 + bass * 1.6) + Math.sin(u * Math.PI * 6 + t * 2.1 + a) * base * (0.25 + treble * 1.4) + u * base * 1.1;
      const x = cx + Math.cos(ang) * r * 1.35;
      const y = cy + Math.sin(ang) * r * 0.85;
      if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Bass flash in the middle.
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, base * (1 + bass * 2.2));
  glow.addColorStop(0, skin.vis[2]);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.25 + bass * 0.5;
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}
