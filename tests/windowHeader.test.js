import {
  HEADER_MODES,
  MAX_HEADER_ACTIONS,
  cleanHeaderText,
  resolveHeaderMeta,
  resolveHeaderMode,
  splitHeaderActions,
  validateHeaderMeta,
} from '../src/lib/windowHeader.js';
import { LOOKS, normalizeShape, shapeToCssVars } from '../src/lib/theme/looks.js';
import { WINDOW_MANIFESTS } from '../src/lib/windowManifest.js';

describe('window header rules', () => {
  test('three modes, three inline actions', () => {
    expect(HEADER_MODES).toEqual(['strip', 'ghost', 'bare']);
    expect(MAX_HEADER_ACTIONS).toBe(3);
  });

  test('mode: design blocks are bare, a window override beats the theme, frameless is ghost', () => {
    expect(resolveHeaderMode({}, 'strip')).toBe('strip');
    expect(resolveHeaderMode({}, 'ghost')).toBe('ghost');
    expect(resolveHeaderMode({ headerMode: 'bare' }, 'ghost')).toBe('bare');
    expect(resolveHeaderMode({ frameless: true }, 'strip')).toBe('ghost');
    expect(resolveHeaderMode({ frameless: true, bare: true, headerMode: 'strip' }, 'strip')).toBe('bare');
    expect(resolveHeaderMode({ headerMode: 'nope' }, 'also-nope')).toBe('strip');
  });

  test('header text drops emoji but keeps words and punctuation', () => {
    expect(cleanHeaderText('⚡ Summon Rook (OpenClaw)')).toBe('Summon Rook (OpenClaw)');
    expect(cleanHeaderText('🧰 AI Coding Assistants')).toBe('AI Coding Assistants');
    expect(cleanHeaderText('Launch plan.md')).toBe('Launch plan.md');
    expect(cleanHeaderText(undefined)).toBeUndefined();
  });

  test('manifest meta falls back to label and launcher icon', () => {
    expect(resolveHeaderMeta({ label: 'Chat', launcher: { icon: 'Chat' } })).toEqual({ title: 'Chat', icon: 'Chat', mode: null });
    expect(resolveHeaderMeta({ label: 'X', header: { title: 'Design block', icon: 'Code', mode: 'bare' } }))
      .toEqual({ title: 'Design block', icon: 'Code', mode: 'bare' });
    expect(resolveHeaderMeta(undefined)).toEqual({ title: '', icon: null, mode: null });
  });

  test('validation allows only title, icon and mode, all well formed', () => {
    expect(validateHeaderMeta('a', undefined)).toEqual([]);
    expect(validateHeaderMeta('a', { title: 'Files', icon: 'Files', mode: 'ghost' }, { iconNames: ['Files'] })).toEqual([]);
    const errors = validateHeaderMeta('a', { title: '⚡ Fast', icon: 'Nope', mode: 'tall', actions: [] }, { iconNames: ['Files'] });
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('header.actions is not allowed'),
      expect.stringContaining('plain text'),
      expect.stringContaining('"Nope" is not an Icon'),
      expect.stringContaining('header.mode must be one of'),
    ]));
    expect(validateHeaderMeta('a', 'strip')).toEqual(['a: header must be an object']);
  });

  test('every shipped manifest header is valid', () => {
    for (const m of WINDOW_MANIFESTS) expect(validateHeaderMeta(m.kind, m.header)).toEqual([]);
  });

  test('actions split into three inline and the rest overflow', () => {
    expect(splitHeaderActions([1, null, 2, 3, 4, 5])).toEqual({ inline: [1, 2, 3], overflow: [4, 5] });
    expect(splitHeaderActions([])).toEqual({ inline: [], overflow: [] });
  });

  test('header mode is a look knob: old themes default to strip, Studio uses ghost', () => {
    expect(normalizeShape({}).headerMode).toBe('strip');
    expect(normalizeShape({ headerMode: 'bare' }).headerMode).toBe('bare');
    expect(normalizeShape({ headerMode: 'huge' }).headerMode).toBe('strip');
    expect(LOOKS.studio.shape.headerMode).toBe('ghost');
    expect(LOOKS.graphite.shape.headerMode).toBe('strip');
    // Header mode is layout (a frame attribute), not a CSS variable.
    expect(Object.keys(shapeToCssVars({ headerMode: 'ghost' }))).not.toContain('--header-mode');
  });
});
