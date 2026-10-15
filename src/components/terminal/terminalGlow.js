// The Glow look: a bundled pixel font (VT323, SIL Open Font License) with a
// soft glow around every character in its own color. It is a per-window
// switch (win.terminalGlow), off by default. The glow itself is CSS
// (src/styles/terminal-glow.css) on xterm's DOM renderer, so it costs no
// extra drawing work.
import '@fontsource/vt323/400.css';
import { GLOW_TERMINAL_COLORS } from '../windows/terminalThemePresets.jsx';

export const GLOW_FONT_FAMILY = '"VT323", "JetBrains Mono", ui-monospace, monospace';
export const NORMAL_FONT_FAMILY = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace';
// VT323 draws small for its size; this keeps the glow look as readable as
// the normal one at the same font size setting.
export const GLOW_FONT_SCALE = 1.35;

export function terminalFont(glow, baseSize = 13, windowScale = 1) {
  const size = Number(baseSize) || 13;
  const scale = Number(windowScale) || 1;
  return {
    fontFamily: glow ? GLOW_FONT_FAMILY : NORMAL_FONT_FAMILY,
    fontSize: Math.round(size * scale * (glow ? GLOW_FONT_SCALE : 1)),
    // The pixel font has no bold; a faked bold is wider than its cell and
    // breaks the grid. Bold text shows in its bright color instead.
    fontWeightBold: glow ? 'normal' : 'bold',
  };
}

// A window that picked its own colors keeps them; otherwise the glow look
// brings its neon palette instead of the board's look.
export function glowTheme(pickedTheme, lookTheme) {
  if (pickedTheme) return pickedTheme;
  return { ...GLOW_TERMINAL_COLORS, fontSize: lookTheme?.fontSize };
}

// xterm measures the character cell once per font change; measuring before
// the web font arrives gives a wrong grid, so wait for it first.
export function whenGlowFontReady() {
  if (typeof document === 'undefined' || !document.fonts?.load) return Promise.resolve();
  return document.fonts.load('16px "VT323"').then(() => undefined, () => undefined);
}
