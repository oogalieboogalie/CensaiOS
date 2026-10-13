// The develop math for YorWare Photos, as plain functions on RGBA pixel
// arrays so the screen, the grid thumbnails and the exported file all go
// through the same code (and tests can check it without a browser).
//
// Per channel, in this order: undo the sRGB curve, white balance (warmth and
// tint as channel gains), exposure in stops, back to sRGB, then shadows,
// highlights and contrast as tone curves. That part is a 256-entry lookup
// table per channel, so a slider drag stays fast. Vibrance and saturation
// mix the channels, so they run per pixel, only when they are not zero.
import { normalizeEdits } from './photoLibModel.js';

const toLinear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toSrgb = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const LINEAR = Float64Array.from({ length: 256 }, (_, i) => toLinear(i / 255));

/** Channel gains for warmth and tint (each -100..100). */
export function whiteBalanceGains(temp, tint) {
  const t = temp / 100;
  const m = tint / 100;
  return [2 ** t, 2 ** (-0.6 * m), 2 ** -t];
}

/** One tone curve on a 0..1 value: shadows, highlights, contrast (each -1..1). */
export function toneCurve(v, shadows, highlights, contrast) {
  let x = v + shadows * 0.9 * v * (1 - v) * (1 - v);
  x += highlights * 0.9 * x * x * (1 - x);
  const k = contrast >= 0 ? 1 + contrast : 1 + contrast * 0.6;
  return clamp01(0.5 + (clamp01(x) - 0.5) * k);
}

/** Three 256-entry tables (red, green, blue) for the per-channel part. */
export function buildLuts(rawEdits) {
  const e = normalizeEdits(rawEdits);
  const gains = whiteBalanceGains(e.temp, e.tint);
  const ev = 2 ** e.exposure;
  const s = e.shadows / 100;
  const h = e.highlights / 100;
  const c = e.contrast / 100;
  return gains.map((g) => {
    const lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i += 1) {
      const lin = LINEAR[i] * g * ev;
      lut[i] = Math.round(toneCurve(toSrgb(clamp01(lin)), s, h, c) * 255);
    }
    return lut;
  });
}

/** Apply develop settings to RGBA pixels in place. Returns the same array. */
export function adjustPixels(data, rawEdits) {
  const e = normalizeEdits(rawEdits);
  const [lr, lg, lb] = buildLuts(e);
  const sat = e.saturation / 100;
  const vib = e.vibrance / 100;
  const mix = sat !== 0 || vib !== 0;
  for (let i = 0; i < data.length; i += 4) {
    let r = lr[data[i]];
    let g = lg[data[i + 1]];
    let b = lb[data[i + 2]];
    if (mix) {
      const max = Math.max(r, g, b);
      const chroma = (max - Math.min(r, g, b)) / 255;
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const f = (1 + sat) * (1 + vib * (vib > 0 ? 1 - chroma : 1));
      r = lum + (r - lum) * f;
      g = lum + (g - lum) * f;
      b = lum + (b - lum) * f;
    }
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
  return data;
}

/**
 * Brightness counts in 64 bins for red, green, blue and overall, as
 * fractions of the tallest bin, for the little histogram in Develop.
 */
export function histogram(data, bins = 64) {
  const out = [new Float32Array(bins), new Float32Array(bins), new Float32Array(bins), new Float32Array(bins)];
  const step = Math.max(1, Math.floor(data.length / 4 / 40000)) * 4;
  const shift = 256 / bins;
  for (let i = 0; i < data.length; i += step) {
    const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
    out[0][(r / shift) | 0] += 1;
    out[1][(g / shift) | 0] += 1;
    out[2][(b / shift) | 0] += 1;
    out[3][((0.2126 * r + 0.7152 * g + 0.0722 * b) / shift) | 0] += 1;
  }
  let top = 1;
  for (const ch of out) for (const v of ch) if (v > top) top = v;
  return out.map((ch) => Array.from(ch, (v) => v / top));
}

/**
 * "Auto": a starting point from the pixels. White balance part of the way
 * towards a picture that averages out to grey (all the way would bleach a
 * blue sky or a sunset), then exposure part of the way towards a middle
 * brightness of mid-grey. Rounded so the sliders show tidy numbers.
 */
const AUTO_SHARE = 0.6;

export function autoEdits(data) {
  let R = 0; let G = 0; let B = 0; let n = 0;
  const step = Math.max(1, Math.floor(data.length / 4 / 20000)) * 4;
  const lums = [];
  for (let i = 0; i < data.length; i += step) {
    const r = LINEAR[data[i]]; const g = LINEAR[data[i + 1]]; const b = LINEAR[data[i + 2]];
    R += r; G += g; B += b; n += 1;
    lums.push(0.2126 * r + 0.7152 * g + 0.0722 * b);
  }
  if (!n || R <= 0 || B <= 0 || G <= 0) return { exposure: 0, temp: 0, tint: 0 };
  const temp = Math.max(-0.6, Math.min(0.6, (AUTO_SHARE * Math.log2(B / R)) / 2));
  const [rg, , bg] = whiteBalanceGains(temp * 100, 0);
  const gg = ((R * rg + B * bg) / 2) / G;
  const tint = Math.max(-0.6, Math.min(0.6, (-AUTO_SHARE * Math.log2(gg)) / 0.6));
  lums.sort((a, b) => a - b);
  const mid = lums[Math.floor(lums.length / 2)] || 0.18;
  const exposure = Math.max(-1.5, Math.min(1.5, AUTO_SHARE * Math.log2(0.18 / Math.max(mid, 0.002))));
  return { exposure: Math.round(exposure * 20) / 20, temp: Math.round(temp * 100), tint: Math.round(tint * 100) };
}
