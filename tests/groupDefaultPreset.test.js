/** @jest-environment jsdom */
import { resolveGroupArrangePreset } from '../src/lib/layout/defaultPreset.js';
import { useWorkspaceStore } from '../src/lib/store.js';

// "Default layout" for a canvas group: the starred saved snapshot decides
// which built-in layout tidies the group when a window newly enters it.
describe('resolveGroupArrangePreset', () => {
  const presets = [
    { id: 'snap-quad', name: 'My quad', presetId: 'QUAD' },
    { id: 'snap-manual', name: 'Hand placed', presetId: null },
  ];

  test('uses the built-in layout the starred snapshot was saved with', () => {
    expect(resolveGroupArrangePreset({ presets, defaultPresetId: 'snap-quad', presetId: 'SPLIT_LR' })).toBe('QUAD');
  });

  test('never returns the raw snapshot id (the arrange engine cannot read it)', () => {
    const resolved = resolveGroupArrangePreset({ presets, defaultPresetId: 'snap-manual', presetId: 'SPLIT_LR' });
    expect(resolved).toBe('SPLIT_LR');
    expect(resolveGroupArrangePreset({ presets, defaultPresetId: 'snap-manual' })).toBe('SEMANTIC_WORKSPACE');
  });

  test('falls back to the group layout, then the semantic workspace', () => {
    expect(resolveGroupArrangePreset({ presets, defaultPresetId: 'deleted', presetId: 'QUAD' })).toBe('QUAD');
    expect(resolveGroupArrangePreset({ presets: [] })).toBe('SEMANTIC_WORKSPACE');
    expect(resolveGroupArrangePreset(null)).toBe('SEMANTIC_WORKSPACE');
  });
});

describe('group default preset store actions', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      wins: [],
      canvasGroups: [
        { id: 'g1', presets: [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }], defaultPresetId: null },
        { id: 'g2', presets: [], defaultPresetId: null },
      ],
    });
  });
  const group = (id) => useWorkspaceStore.getState().canvasGroups.find((g) => g.id === id);

  test('set, switch and clear the default on one group only', () => {
    const { setGroupDefaultPreset } = useWorkspaceStore.getState();
    setGroupDefaultPreset('g1', 'p1');
    expect(group('g1').defaultPresetId).toBe('p1');
    expect(group('g2').defaultPresetId).toBeNull();
    setGroupDefaultPreset('g1', 'p2');
    expect(group('g1').defaultPresetId).toBe('p2');
    setGroupDefaultPreset('g1', null);
    expect(group('g1').defaultPresetId).toBeNull();
  });

  test('deleting the starred layout clears the default; deleting another keeps it', () => {
    const { setGroupDefaultPreset, deleteGroupPreset } = useWorkspaceStore.getState();
    setGroupDefaultPreset('g1', 'p1');
    deleteGroupPreset('g1', 'p2');
    expect(group('g1').defaultPresetId).toBe('p1');
    deleteGroupPreset('g1', 'p1');
    expect(group('g1').defaultPresetId).toBeNull();
    expect(group('g1').presets).toEqual([]);
  });
});
