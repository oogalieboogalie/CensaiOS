// Real-signal readers and the VU meter for the Music window's visualizer.
// USB files play through the Web Audio API, so these read their actual
// spectrum, waveform and channel levels from AnalyserNodes.

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Log-spaced bands from 40 Hz to 16 kHz, like a graphic equalizer. */
export function readSpectrum(analyser, out, buf) {
  analyser.getByteFrequencyData(buf);
  const n = out.length;
  const nyquist = (analyser.context?.sampleRate || 44100) / 2;
  const bins = buf.length;
  const lo = Math.log(40);
  const hi = Math.log(16000);
  for (let i = 0; i < n; i++) {
    const f0 = Math.exp(lo + ((hi - lo) * i) / n);
    const f1 = Math.exp(lo + ((hi - lo) * (i + 1)) / n);
    const b0 = Math.max(0, Math.floor((f0 / nyquist) * bins));
    const b1 = Math.min(bins - 1, Math.max(b0, Math.ceil((f1 / nyquist) * bins)));
    let peak = 0;
    for (let b = b0; b <= b1; b++) if (buf[b] > peak) peak = buf[b];
    out[i] = clamp01(Math.pow(peak / 255, 1.4));
  }
  return out;
}

/** Time-domain samples in [-1, 1]. */
export function readWaveform(analyser, out, buf) {
  analyser.getByteTimeDomainData(buf);
  for (let i = 0; i < out.length; i++) out[i] = (buf[i] - 128) / 128;
  return out;
}

/** RMS of one channel mapped from -48..0 dBFS onto a 0..1 needle swing. */
export function readVu(analyser, buf) {
  analyser.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i] - 128) / 128;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / Math.max(1, buf.length));
  if (rms <= 0) return 0;
  return clamp01((20 * Math.log10(rms) + 48) / 48);
}

/** Synthetic stand-in for VU levels when the audio can't be read. */
export function vuFromLevels(levels) {
  const n = levels.length;
  let left = 0;
  let right = 0;
  for (let i = 0; i < n; i++) {
    if (i % 2 === 0) left += levels[i]; else right += levels[i];
  }
  const half = Math.max(1, n / 2);
  return [clamp01((left / half) * 1.35), clamp01((right / half) * 1.35)];
}

/** Twin analog VU meters (left / right) with a red zone past 0 VU. */
export function drawVu(ctx, w, h, vu, skin) {
  ctx.clearRect(0, 0, w, h);
  const meters = 2;
  const pad = 6;
  const mw = (w - pad * (meters + 1)) / meters;
  for (let m = 0; m < meters; m++) {
    const x0 = pad + m * (mw + pad);
    const cx = x0 + mw / 2;
    const r = Math.min(mw * 0.48, h * 0.78);
    const cy = Math.min(h - 6, (h + r) / 2 + 4);
    const start = Math.PI * 1.2;
    const end = Math.PI * 1.8;
    // Scale ticks; the last fifth is the red zone.
    for (let t = 0; t <= 10; t++) {
      const a = start + ((end - start) * t) / 10;
      const hot = t >= 8;
      ctx.strokeStyle = hot ? skin.vis[0] : skin.lcdInk;
      ctx.globalAlpha = hot ? 1 : 0.7;
      ctx.lineWidth = t % 5 === 0 ? 2 : 1;
      const inner = r * (t % 5 === 0 ? 0.78 : 0.85);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = skin.vis[0];
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.95, start + (end - start) * 0.8, end);
    ctx.stroke();
    // Needle.
    const a = start + (end - start) * clamp01(vu[m] || 0);
    ctx.shadowColor = skin.lcdGlow;
    ctx.shadowBlur = 6;
    ctx.strokeStyle = skin.peak;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = skin.lcdInk;
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(m === 0 ? 'L' : 'R', cx, cy - r * 0.35);
  }
}
