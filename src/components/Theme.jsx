import React from 'react';
import { useWorkspaceStore } from '../lib/store.js';
import { Icon } from './Icons.jsx';
import { api } from '../lib/api.js';
import { computeTokenMap } from '../lib/theme/tokens.js';
import {
  PRESET_LIBRARY,
  getMoodsView,
  getThemePresetsView,
} from '../lib/theme/presetLibrary.js';
import { getSurfaceControlsView } from '../lib/theme/surfaceControls.js';
import { DEFAULT_LOOK_ID, LIGHT_DEFAULT_LOOK_ID, lookPatch, resolveMood, shapeToCssVars, normalizeShape } from '../lib/theme/looks.js';
import { syncDesktopTitleBar } from '../lib/desktopTitleBar.js';
import { setGroupGap } from '../lib/layout/gap.js';

// Re-exported so the rest of the app can read PRESET_LIBRARY without coupling
// to Theme.jsx. New surfaces (code editor, terminal, agent cards, …) should
// import from here OR from presetLibrary.js directly.
export { PRESET_LIBRARY, getMoodsView, getThemePresetsView } from '../lib/theme/presetLibrary.js';

const THEME_KEY = 'homebase.theme.v1';
// Bumped when the default look changes for everyone. A saved theme from an
// older version moves to the new default once (board settings such as
// snapping and font size are kept); after that, whatever the person picks
// sticks. Version 2 recoloured the brand looks (cyan to Ultem amber): a board
// already on censaiOS or Paper takes the new colours and keeps everything
// else; a board on any other look is left alone.
export const BRAND_LOOK_VERSION = 2;
const RECOLOURED_LOOKS = ['censai', 'paper'];
const colourPatch = (moodId) => ({ ...(MOODS[moodId]?.accent || {}) });
const BOARD_SETTINGS = ['gridSnapping', 'groupSnapping', 'agentCursors', 'canvasPanMode', 'borderWidth', 'fontScale', 'frostedGlass', 'glassBlur'];
// Default board: the censaiOS brand look (Canvas, light ink, one Ultem
// accent, sentence-case labels, no glow). Shape fields come from looks.js.
export const DEFAULT_THEME = {
  customVars: {}, gridSnapping: true, groupSnapping: true, agentCursors: true, canvasPanMode: 'both', borderWidth: 1, fontScale: 1.0,
  // Frosted glass menus, pop-ups and bars (src/styles/glass.css).
  frostedGlass: true, glassBlur: 1,
  ...lookPatch(DEFAULT_LOOK_ID),
  brandLook: BRAND_LOOK_VERSION,
};

function prefersLight() {
  try { return window.matchMedia?.('(prefers-color-scheme: light)')?.matches === true; } catch { return false; }
}

/** The default for this visitor: the brand look, on paper if they browse light. */
export function defaultTheme({ light = prefersLight() } = {}) {
  return light ? { ...DEFAULT_THEME, ...lookPatch(LIGHT_DEFAULT_LOOK_ID) } : { ...DEFAULT_THEME };
}

/** Saved theme → theme to use, moving pre-brand themes to the brand look once. */
export function migrateTheme(saved, opts) {
  const base = defaultTheme(opts);
  if (!saved || typeof saved !== 'object') return base;
  if (saved.brandLook === BRAND_LOOK_VERSION) return { ...DEFAULT_THEME, ...saved };
  if (saved.brandLook === 1) {
    const recolour = RECOLOURED_LOOKS.includes(saved.mood) ? colourPatch(saved.mood) : {};
    return { ...DEFAULT_THEME, ...saved, ...recolour, brandLook: BRAND_LOOK_VERSION };
  }
  const kept = {};
  BOARD_SETTINGS.forEach((k) => { if (saved[k] !== undefined) kept[k] = saved[k]; });
  return { ...base, ...kept };
}
const THEME_VAR_DEFAULTS = {
  '--accent-contrast': 'oklch(1 0 0)',
  '--accent-text': 'var(--accent)',
  '--accent-line': 'var(--accent)',
  '--window-bg': 'var(--surface)',
  '--window-title-bg': 'transparent',
  '--window-backdrop': 'none',
  '--window-title-backdrop': 'none',
  '--window-radius': 'var(--radius-card)',
  '--window-shadow': 'var(--shadow-card)',
  '--window-control-idle-opacity': '0',
  '--window-extra-controls-display': 'none',
  '--window-strip-bg': 'transparent',
  '--window-strip-height': '0px',
};

// Backwards-compatible factory kept here so legacy callers (and Theme.jsx
// internals) can keep using `mood(mode, accent, vars)` to construct ad-hoc
// mood objects. PRESET_LIBRARY moods are already in this shape after the
// getMoodsView() pass.
const mood = (mode, accent, vars) => ({ mode, accent, vars });

// ── Brief A2 — PRESET_LIBRARY v0.1 ──────────────────────────────────────────
// MOODS and THEME_PRESETS are now DERIVED VIEWS over PRESET_LIBRARY. Adding
// a new preset means editing src/lib/theme/presetLibrary.js — NOT this file.
// The shape and ordering of entries here is preserved exactly so existing
// callers (WindowFrame, useThemePanel, ThemePresets, ThemeControls,
// ThemeDesignSections) see no behavior change. See brief at
// .team/handoffs/2026-06-23-a2-preset-library-unification.md.
export const MOODS = getMoodsView();
export const THEME_PRESETS = getThemePresetsView();

export const SURFACE_CONTROLS = getSurfaceControlsView();

function loadTheme() {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    return migrateTheme(raw ? JSON.parse(raw) : null);
  } catch {
    return defaultTheme();
  }
}

function saveTheme(t) {
  try { localStorage.setItem(THEME_KEY, JSON.stringify(t)); } catch {}
}

export function createId() {
  return globalThis.crypto?.randomUUID?.() || `preset_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function applyTheme(t) {
  const root = document.documentElement;
  root.style.setProperty('--accent-h', String(t.hue));
  root.style.setProperty('--accent-c', String(t.chroma));
  root.style.setProperty('--accent-l', String(t.lightness));
  // Clear knob-owned vars a previous look may have set (e.g. glass).
  ['--window-bg', '--window-backdrop'].forEach((k) => root.style.removeProperty(k));
  root.style.setProperty('--app-font-scale', String(t.fontScale || 1.0));
  const mood = resolveMood(t, MOODS);
  const shape = normalizeShape(t);
  setGroupGap(shape.groupGap);
  root.setAttribute('data-theme', mood.mode);
  root.setAttribute('data-mood', t.mood);
  root.setAttribute('data-glow', shape.glow ? 'on' : 'off');
  root.setAttribute('data-frost', t.frostedGlass === false ? 'off' : 'on');
  root.style.setProperty('--glass-blur-scale', String(t.glassBlur ?? 1));
  Object.entries(THEME_VAR_DEFAULTS).forEach(([k, v]) => root.style.setProperty(k, v));
  Object.entries(mood.vars).forEach(([k, v]) => root.style.setProperty(k, v));
  // A1 — derive the window-frame tokens from the effective (post-merge) surface
  // so live-edits of --surface from the Fine Tune panel propagate to the
  // header and shadow. Derived first so explicit Fine Tune overrides win.
  const derived = computeTokenMap(mood, { customVars: t.customVars, headerTint: shape.headerTint });
  Object.entries(derived).forEach(([k, v]) => root.style.setProperty(k, v));
  // Design-system shape knobs (radius, density, fonts, labels, motion, glass).
  Object.entries(shapeToCssVars(shape)).forEach(([k, v]) => root.style.setProperty(k, v));
  Object.entries(t.customVars || {}).forEach(([k, v]) => {
    if (v) root.style.setProperty(k, v);
  });
  syncDesktopTitleBar();
}

const ThemeContext = React.createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = React.useState(loadTheme);
  React.useEffect(() => { applyTheme(theme); saveTheme(theme); }, [theme]);
  const setTheme = (patch) => setThemeState(prev => ({ ...prev, ...patch }));
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) return { theme: DEFAULT_THEME, setTheme: () => {} };
  return ctx;
}

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function parseOklch(value) {
  const match = String(value || '').match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  return match ? { l: +match[1], c: +match[2], h: +match[3] } : { l: 0.6, c: 0.05, h: 145 };
}

export function oklch({ l, c, h }) {
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${Math.round(h)})`;
}

export { ThemePanel } from './theme/ThemePanel.jsx';
