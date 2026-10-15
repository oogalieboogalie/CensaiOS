// The terminal and Code Editor colors for the board's current look. Both used
// to start from a fixed slate-blue theme, so a new terminal or editor came up
// blue whatever look was picked. Now an uncustomized window takes every color
// from the look: background and text from the look's surface and ink, the
// cursor from its accent, and the 16 terminal colors from fixed hues at a
// lightness that reads on the look's light or dark surface.
//
// A per-window theme (picked from the gear menu) still wins. Colors come out
// as #rrggbb because xterm cannot read oklch() and the editor theme adds alpha
// to hex values.

import { useMemo } from 'react';
import { MOODS, useTheme } from '../Theme.jsx';
import { resolveMood } from '../../lib/theme/looks.js';
import { DEFAULT_THEME, LEGACY_DEFAULT_BACKGROUNDS } from '../windows/WindowThemePanel.jsx';
import { accentOklch, oklchToRgbString, resolveCssColor } from './canvasTerminalTheme.js';

// Hues for the terminal's named colors (oklch degrees).
const HUES = { red: 25, green: 150, yellow: 85, blue: 250, magenta: 330, cyan: 200 };
// Lightness / chroma per board mode, so colors stay readable on the surface.
const LADDER = {
  dark: { l: 0.74, c: 0.13, brightL: 0.83 },
  light: { l: 0.5, c: 0.15, brightL: 0.42 },
};

// A window that saved the old blue default has not really picked a theme.
const OLD_DEFAULT_BACKGROUNDS = new Set(LEGACY_DEFAULT_BACKGROUNDS);

export function rgbToHex(value) {
  const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(String(value || ''));
  if (!m) return '';
  return `#${[m[1], m[2], m[3]].map((n) => Math.max(0, Math.min(255, Math.round(Number(n)))).toString(16).padStart(2, '0')).join('')}`;
}

const hexOf = (cssColor) => rgbToHex(resolveCssColor(cssColor, ''));

/** A saved per-window theme, or null when the window should follow the look. */
export function pickedWindowTheme(saved) {
  if (!saved || typeof saved !== 'object') return null;
  if (OLD_DEFAULT_BACKGROUNDS.has(saved.background)) return null;
  return saved;
}

/** Pure: the full terminal / editor color set for a canvas theme state. */
export function lookCodeTheme(canvasTheme = {}, moods = {}) {
  const mood = resolveMood(canvasTheme, moods) || { vars: {} };
  const custom = canvasTheme.customVars || {};
  const get = (name) => custom[name] || (mood.vars && mood.vars[name]) || '';
  const mode = mood.mode === 'light' ? 'light' : 'dark';
  const step = LADDER[mode];
  const named = {};
  for (const [name, hue] of Object.entries(HUES)) {
    named[name] = rgbToHex(oklchToRgbString(step.l, step.c, hue));
    named[`bright${name[0].toUpperCase()}${name.slice(1)}`] = rgbToHex(oklchToRgbString(step.brightL, step.c, hue));
  }
  const pick = (cssColor, fallback) => hexOf(cssColor) || fallback;
  const ink = pick(get('--ink'), DEFAULT_THEME.foreground);
  const theme = {
    ...DEFAULT_THEME,
    ...named,
    mode,
    // A number: xterm and the font size box cannot read a CSS variable.
    // eslint-disable-next-line no-restricted-syntax -- xterm needs a pixel number
    fontSize: 13,
    background: pick(get('--surface'), DEFAULT_THEME.background),
    foreground: ink,
    cursor: pick(accentOklch(canvasTheme.hue, canvasTheme.chroma, canvasTheme.lightness), ink),
    selectionBackground: pick(get('--hairline-strong'), DEFAULT_THEME.selectionBackground),
    black: pick(mode === 'dark' ? get('--hairline') : get('--ink'), DEFAULT_THEME.black),
    brightBlack: pick(get('--ink-faint'), DEFAULT_THEME.black),
    white: pick(mode === 'dark' ? get('--ink-soft') : get('--hairline-strong'), DEFAULT_THEME.white),
    brightWhite: pick(mode === 'dark' ? get('--ink') : get('--hairline'), DEFAULT_THEME.white),
  };
  return theme;
}

/** The look's terminal / editor colors, recomputed when the look changes. */
export function useLookCodeTheme() {
  const { theme: canvasTheme } = useTheme();
  const customKey = JSON.stringify(canvasTheme.customVars || {});
  const colorsKey = JSON.stringify(canvasTheme.customColors || {});
  return useMemo(
    () => lookCodeTheme(canvasTheme, MOODS),
    [canvasTheme.mood, canvasTheme.hue, canvasTheme.chroma, canvasTheme.lightness, customKey, colorsKey],
  );
}
