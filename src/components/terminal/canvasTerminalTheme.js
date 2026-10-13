// Derive an uncustomized terminal's colors from the canvas theme STATE
// (not from painted styles — styles update after render, which left the
// terminal one step behind, showing the previous pick). A per-window custom
// theme (win.terminalTheme) still wins — this module only builds the default.
//
// Canvas tokens are oklch() strings, which xterm cannot parse, so they go
// through the oklch math below into rgb(). Anything that fails to resolve
// falls back to the base theme value.

// Merge order mirrors applyTheme(): mood vars, then user fine-tune wins.
export function themeVarsFor(canvasTheme, moodsView) {
  const moods = moodsView || {};
  const mood = moods[canvasTheme.mood] || moods.cream || { vars: {} };
  const custom = canvasTheme.customVars || {};
  const get = (name) => custom[name] || (mood.vars && mood.vars[name]) || '';
  return {
    background: get('--surface'),
    foreground: get('--ink'),
    selection: get('--accent-soft'),
  };
}

export function resolveCssColor(value, fallback) {
  // Path 1: oklch() via real math — works in any browser or shell,
  // including ones whose CSS engine predates oklch().
  const parsed = parseOklchColor(value);
  if (parsed) return oklchToRgbString(parsed.l, parsed.c, parsed.h);
  // Path 2: let the browser resolve anything else (hex, names, var()).
  if (typeof document === 'undefined' || typeof value !== 'string' || !value) return fallback;
  try {
    const probe = document.createElement('div');
    probe.style.color = value;
    if (!probe.style.color) return fallback;
    document.body.appendChild(probe);
    const computed = window.getComputedStyle(probe).color;
    probe.remove();
    return /^rgba?\(/i.test(String(computed)) ? computed : fallback;
  } catch {
    return fallback;
  }
}

const OKLCH_RE = /^oklch\(\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.\-eE]+)\s*\)$/i;

export function parseOklchColor(value) {
  const match = OKLCH_RE.exec(String(value || '').trim());
  if (!match) return null;
  const l = Number(match[1]);
  const c = Number(match[2]);
  const h = Number(match[3]);
  if (![l, c, h].every(Number.isFinite)) return null;
  return { l, c, h };
}

function clip01(u) {
  return Math.min(1, Math.max(0, u));
}

// oklch → sRGB, clipping out-of-gamut channels exactly like browsers do
// when resolving oklch() to computed rgb().
export function oklchToRgbString(l, c, h) {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.2914855480 * b;
  const l3 = l_ * l_ * l_;
  const m3 = m_ * m_ * m_;
  const s3 = s_ * s_ * s_;
  const toSrgb = (u) => {
    const v = clip01(u);
    return v >= 0.0031308 ? 1.055 * v ** (1 / 2.4) - 0.055 : 12.92 * v;
  };
  const r = Math.round(toSrgb(4.0767416621 * l3 - 3.3077115906 * m3 + 0.2309699292 * s3) * 255);
  const g = Math.round(toSrgb(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3) * 255);
  const blue = Math.round(toSrgb(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3) * 255);
  return `rgb(${r}, ${g}, ${blue})`;
}

export function accentOklch(hue, chroma, lightness) {
  if (![hue, chroma, lightness].every(Number.isFinite)) return '';
  return `oklch(${lightness} ${chroma} ${hue})`;
}

// Pure merge: resolved canvas colors over a base xterm theme. Empty values
// keep the base so a half-readable canvas never blanks the terminal.
export function buildCanvasTerminalTheme(base, colors = {}) {
  const next = { ...base };
  if (colors.background) next.background = colors.background;
  if (colors.foreground) next.foreground = colors.foreground;
  if (colors.cursor) next.cursor = colors.cursor;
  if (colors.selection) next.selectionBackground = colors.selection;
  return next;
}
