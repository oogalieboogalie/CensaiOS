/**
 * tests/win98.test.js
 *
 * Windows 98 skin — the mood (teal desktop, silver surfaces) plus the
 * matching per-window chrome variant (square bevel, navy title). The two
 * halves are deliberately separate: the mood carries everything the
 * derivation engine leaves alone, the variant carries the navy title and
 * bevel shadow as inline frame props (which beat the derived values).
 */
import { MOODS } from '../src/components/Theme.jsx';
import { PRESET_LIBRARY, getPresetSource } from '../src/lib/theme/presetLibrary.js';
import { CURATED_MOOD_IDS } from '../src/lib/theme/curatedPresets.js';
import { CHROME_VARIANTS, getChromeVariant } from '../src/lib/theme/chromeVariants.js';

describe('Windows 98 skin', () => {
  test('win98 mood is a light colorway with a teal desktop and silver surfaces', () => {
    const mood = MOODS.win98;
    expect(mood).toBeDefined();
    expect(mood.mode).toBe('light');
    expect(PRESET_LIBRARY.win98).toBeDefined();
    expect(getPresetSource('win98')).toBe('mood');
    expect(mood.accent.hue).toBe(264);
    expect(mood.vars['--canvas']).toMatch(/195/);
    expect(mood.vars['--window-radius']).toBe('0');
    expect(mood.vars['--window-control-idle-opacity']).toBe('1');
  });

  test('win98 is offered in the Appearance panel', () => {
    expect(CURATED_MOOD_IDS).toContain('win98');
  });

  test('win98 chrome variant is square, beveled, navy-titled, no gradients', () => {
    const variant = getChromeVariant('win98');
    expect(variant).toBeDefined();
    expect(CHROME_VARIANTS.win98.label).toBe('Windows 98');
    expect(variant.vars['--window-radius']).toBe('0');
    expect(variant.vars['--window-title-bg']).toMatch(/264/);
    expect(variant.vars['--window-shadow']).toContain('inset');
    expect(variant.vars['--window-control-idle-opacity']).toBe('1');
    for (const value of Object.values(variant.vars)) {
      expect(value).not.toMatch(/gradient/);
    }
  });
});
