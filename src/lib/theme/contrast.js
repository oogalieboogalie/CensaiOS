/**
 * src/lib/theme/contrast.js
 *
 * WCAG contrast for theme colors written as oklch(...) or hex. Pure math, no
 * deps: OKLCH -> OKLab -> linear sRGB -> relative luminance.
 */

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function oklchToLinearRgb(l, c, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  return [
    clamp01(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
    clamp01(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
    clamp01(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
  ];
}

/** Parse an oklch() or hex color into linear sRGB, or null if unsupported. */
export function parseColor(value) {
  const str = String(value || '').trim();
  const m = str.match(/^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)/i);
  if (m) {
    const l = m[2] === '%' ? Number(m[1]) / 100 : Number(m[1]);
    return oklchToLinearRgb(l, Number(m[3]), Number(m[4]));
  }
  const hex = str.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const full = hex[1].length === 3 ? hex[1].split('').map((ch) => ch + ch).join('') : hex[1];
    return [0, 2, 4].map((i) => srgbToLinear(parseInt(full.slice(i, i + 2), 16) / 255));
  }
  return null;
}

export function relativeLuminance(value) {
  const rgb = parseColor(value);
  if (!rgb) return null;
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

/** WCAG contrast ratio (1..21) between two colors, or null if unparseable. */
export function contrastRatio(fg, bg) {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  if (a == null || b == null) return null;
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** Text/background pairs every look must keep readable (WCAG AA = 4.5). */
export const TEXT_PAIRS = Object.freeze([
  ['--ink', '--surface'],
  ['--ink', '--surface-2'],
  ['--ink', '--bg'],
  ['--ink-soft', '--surface'],
  ['--ink-soft', '--surface-2'],
]);

/** Check a colorway's vars; returns [{ fg, bg, ratio }] for failing pairs. */
export function contrastFailures(vars, minimum = 4.5) {
  const failures = [];
  for (const [fg, bg] of TEXT_PAIRS) {
    const ratio = contrastRatio(vars[fg], vars[bg]);
    if (ratio == null || ratio < minimum) failures.push({ fg, bg, ratio });
  }
  return failures;
}
