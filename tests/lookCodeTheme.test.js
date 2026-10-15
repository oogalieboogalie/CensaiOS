/**
 * @jest-environment jsdom
 */
import { lookCodeTheme, pickedWindowTheme, rgbToHex } from '../src/components/terminal/lookCodeTheme.js';
import { MOOD_ENTRIES } from '../src/lib/theme/presetEntries/moods.js';
import { lookPatch } from '../src/lib/theme/looks.js';

const HEX = /^#[0-9a-f]{6}$/;
const KEYS = ['background', 'foreground', 'cursor', 'selectionBackground', 'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];

// Blue-ish = the blue channel clearly above red and green.
const isBlue = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return b - Math.max(r, g) > 12;
};

test('rgbToHex turns rgb() into #rrggbb', () => {
  expect(rgbToHex('rgb(24, 24, 24)')).toBe('#181818');
  expect(rgbToHex('rgba(255, 0, 10, 0.5)')).toBe('#ff000a');
  expect(rgbToHex('nope')).toBe('');
});

test('every look gives a full hex terminal theme', () => {
  for (const id of ['censai', 'paper', 'studio', 'terminal', 'retro', 'classic']) {
    const theme = lookCodeTheme(lookPatch(id), MOOD_ENTRIES);
    for (const key of KEYS) expect(theme[key]).toMatch(HEX);
  }
});

test('the brand look is not blue and uses its own surface and accent', () => {
  const theme = lookCodeTheme(lookPatch('censai'), MOOD_ENTRIES);
  expect(theme.mode).toBe('dark');
  expect(isBlue(theme.background)).toBe(false);
  // Ultem amber cursor: red channel well above blue.
  const [r, , b] = [1, 3, 5].map((i) => parseInt(theme.cursor.slice(i, i + 2), 16));
  expect(r - b).toBeGreaterThan(80);
});

test('a light look gives a light background and dark text', () => {
  const theme = lookCodeTheme(lookPatch('paper'), MOOD_ENTRIES);
  expect(theme.mode).toBe('light');
  expect(parseInt(theme.background.slice(1, 3), 16)).toBeGreaterThan(220);
  expect(parseInt(theme.foreground.slice(1, 3), 16)).toBeLessThan(60);
});

test('changing the look changes the background', () => {
  const a = lookCodeTheme(lookPatch('censai'), MOOD_ENTRIES).background;
  const b = lookCodeTheme({ ...lookPatch('censai'), mood: 'synthwave' }, MOOD_ENTRIES).background;
  expect(a).not.toBe(b);
});

test('a window that saved the old blue default follows the look again', () => {
  expect(pickedWindowTheme(null)).toBeNull();
  expect(pickedWindowTheme({ background: '#0b1020', foreground: '#d7deea' })).toBeNull();
  const picked = { background: '#000000', foreground: '#FFFFFF' };
  expect(pickedWindowTheme(picked)).toBe(picked);
});
