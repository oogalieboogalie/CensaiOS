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

// Re-exported so the rest of the app can read PRESET_LIBRARY without coupling
// to Theme.jsx. New surfaces (code editor, terminal, agent cards, …) should
// import from here OR from presetLibrary.js directly.
export { PRESET_LIBRARY, getMoodsView, getThemePresetsView } from '../lib/theme/presetLibrary.js';

const THEME_KEY = 'homebase.theme.v1';
export const DEFAULT_THEME = { hue: 225, chroma: 0.18, lightness: 0.66, mood: 'cobalt-deep', customVars: {}, gridSnapping: true, groupSnapping: true, canvasPanMode: 'both', borderWidth: 1, fontScale: 1.0 };
const THEME_VAR_DEFAULTS = {
  '--window-bg': 'var(--surface)',
  '--window-title-bg': 'transparent',
  '--window-backdrop': 'none',
  '--window-title-backdrop': 'none',
  '--window-radius': 'var(--radius-card)',
  '--window-shadow': 'var(--shadow-card)',
  '--window-control-idle-opacity': '0.35',
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
    return raw ? { ...DEFAULT_THEME, ...JSON.parse(raw) } : { ...DEFAULT_THEME };
  } catch {
    return { ...DEFAULT_THEME };
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
  root.style.setProperty('--app-font-scale', String(t.fontScale || 1.0));
  const mood = MOODS[t.mood] || MOODS.cream;
  root.setAttribute('data-theme', mood.mode);
  root.setAttribute('data-mood', t.mood);
  Object.entries(THEME_VAR_DEFAULTS).forEach(([k, v]) => root.style.setProperty(k, v));
  Object.entries(mood.vars).forEach(([k, v]) => root.style.setProperty(k, v));
  Object.entries(t.customVars || {}).forEach(([k, v]) => {
    if (v) root.style.setProperty(k, v);
  });
  // A1 — derive the window-frame tokens from the effective (post-merge) surface
  // so live-edits of --surface from the Fine Tune panel propagate to the
  // header and shadow. customVars can still override these explicitly.
  const derived = computeTokenMap(mood, { customVars: t.customVars });
  Object.entries(derived).forEach(([k, v]) => root.style.setProperty(k, v));
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
