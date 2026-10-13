/**
 * @jest-environment jsdom
 */
import {
  accentOklch,
  buildCanvasTerminalTheme,
  oklchToRgbString,
  parseOklchColor,
  resolveCssColor,
  themeVarsFor,
} from '../src/components/terminal/canvasTerminalTheme.js';

const BASE = {
  background: '#0b1020',
  foreground: '#d7deea',
  cursor: '#f8fafc',
  selectionBackground: '#475569',
  fontSize: 13,
};

test('resolved canvas colors override the base, empties keep it', () => {
  const next = buildCanvasTerminalTheme(BASE, {
    background: 'rgb(250, 250, 250)',
    foreground: 'rgb(17, 17, 17)',
    cursor: '',
    selection: 'rgb(200, 200, 200)',
  });
  expect(next.background).toBe('rgb(250, 250, 250)');
  expect(next.foreground).toBe('rgb(17, 17, 17)');
  expect(next.cursor).toBe(BASE.cursor);
  expect(next.selectionBackground).toBe('rgb(200, 200, 200)');
  expect(next.fontSize).toBe(13);
  expect(BASE.background).toBe('#0b1020');
});

test('accentOklch builds a color string only from real numbers', () => {
  expect(accentOklch(225, 0.18, 0.66)).toBe('oklch(0.66 0.18 225)');
  expect(accentOklch(Number.NaN, 0.18, 0.66)).toBe('');
  expect(accentOklch(225, undefined, 0.66)).toBe('');
});

test('themeVarsFor merges mood vars with fine-tune on top', () => {
  const moods = {
    cream: { vars: { '--surface': 'oklch(0.99 0.005 80)', '--ink': 'oklch(0.22 0.015 60)', '--accent-soft': 'oklch(0.92 0.04 145)' } },
  };
  expect(themeVarsFor({ mood: 'cream', customVars: {} }, moods)).toEqual({
    background: 'oklch(0.99 0.005 80)',
    foreground: 'oklch(0.22 0.015 60)',
    selection: 'oklch(0.92 0.04 145)',
  });
  expect(themeVarsFor(
    { mood: 'cream', customVars: { '--surface': 'oklch(0.5 0.05 80)' } },
    moods,
  ).background).toBe('oklch(0.5 0.05 80)');
  expect(themeVarsFor({ mood: 'nope', customVars: {} }, moods)).toEqual({
    background: 'oklch(0.99 0.005 80)',
    foreground: 'oklch(0.22 0.015 60)',
    selection: 'oklch(0.92 0.04 145)',
  });
  expect(themeVarsFor({ mood: 'nope', customVars: {} }, {})).toEqual({
    background: '',
    foreground: '',
    selection: '',
  });
});

test('resolveCssColor passes rgb through and falls back cleanly', () => {
  const before = document.body.childElementCount;
  expect(resolveCssColor('rgb(10, 20, 30)', 'fallback')).toBe('rgb(10, 20, 30)');
  expect(resolveCssColor('not-a-color', 'fallback')).toBe('fallback');
  expect(resolveCssColor('', 'fallback')).toBe('fallback');
  expect(document.body.childElementCount).toBe(before);
});

test('oklch math hits the anchors without any browser', () => {
  expect(oklchToRgbString(1, 0, 80)).toBe('rgb(255, 255, 255)');
  expect(oklchToRgbString(0, 0, 80)).toBe('rgb(0, 0, 0)');
  expect(resolveCssColor('oklch(0.99 0.005 80)', 'fallback')).toBe(oklchToRgbString(0.99, 0.005, 80));
});

test('oklch blue hue resolves blue-dominant and clips safely', () => {
  const match = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(oklchToRgbString(0.45, 0.18, 260));
  expect(match).not.toBeNull();
  const [, r, g, b] = match.map(Number);
  expect(b).toBeGreaterThan(r);
  expect(b).toBeGreaterThan(g);
  const wild = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(oklchToRgbString(0.7, 0.5, 250));
  expect(wild).not.toBeNull();
});

test('parseOklchColor rejects var() refs and garbage', () => {
  expect(parseOklchColor('oklch(0.66 0.18 225)')).toEqual({ l: 0.66, c: 0.18, h: 225 });
  expect(parseOklchColor('oklch(var(--accent-l) var(--accent-c) var(--accent-h))')).toBeNull();
  expect(parseOklchColor('red')).toBeNull();
});
