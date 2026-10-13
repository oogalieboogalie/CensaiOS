/** @jest-environment jsdom */
import {
  defaultScenes, cleanScenes, loadScenes, saveScenes, resolveRun, sceneLabel,
  computeAreaView, areaOnScreen,
} from '../src/lib/presentScenes.js';

// Present mode's scene list: the podcast set by default, one scene per key,
// and only scenes that show something make it into the run.
describe('presentScenes', () => {
  beforeEach(() => localStorage.clear());

  test('defaults to the six podcast scenes on F1..F6 with notes filled in', () => {
    const scenes = defaultScenes();
    expect(scenes.map((s) => s.key)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(scenes.every((s) => s.notes.length > 20 && s.name === '' && s.area === null)).toBe(true);
    expect(loadScenes('ws-1')).toEqual(scenes);
  });

  test('saves per workspace and drops bad keys and duplicates', () => {
    saveScenes('ws-1', [
      { id: 'a', key: '3', name: 'Leads', notes: 'n', area: null },
      { id: 'b', key: '3', name: 'dupe' },
      { id: 'c', key: '0', name: 'bad key' },
      { id: 'd', key: '7', area: { x: 0, y: 0, w: -5, h: 10 } },
    ]);
    expect(loadScenes('ws-1')).toEqual([
      { id: 'a', key: '3', name: 'Leads', notes: 'n', area: null },
      { id: 'd', key: '7', name: '', notes: '', area: null },
    ]);
    expect(loadScenes('ws-2')).toEqual(defaultScenes());
    expect(cleanScenes('nope')).toBeNull();
  });

  test('the run keeps only scenes with a bound group or a picked area, in order', () => {
    const scenes = [
      { id: 's1', key: '1', name: '', notes: '', area: null },
      { id: 's2', key: '2', name: 'Area', notes: '', area: { x: 0, y: 0, w: 100, h: 100 } },
      { id: 's3', key: '3', name: '', notes: '', area: null },
      { id: 's4', key: '4', name: '', notes: '', area: null },
    ];
    const groups = [{ id: 'g1', label: 'Research', x: 0, y: 0, w: 10, h: 10 }];
    const run = resolveRun(scenes, { 1: 'g1', 3: 'gone' }, groups);
    expect(run.map((e) => e.scene.id)).toEqual(['s1', 's2']);
    expect(sceneLabel(run[0])).toBe('Research');
    expect(sceneLabel(run[1])).toBe('Area');
  });

  test('an area fills the screen and the screen maps back to the same area', () => {
    const viewport = { w: 1000, h: 800 };
    const area = areaOnScreen({ x: -200, y: -100 }, 0.5, viewport);
    expect(area).toEqual({ x: 400, y: 200, w: 2000, h: 1600 });
    const view = computeAreaView({ x: 0, y: 0, w: 952, h: 752 }, viewport);
    expect(view.zoom).toBeCloseTo(1);
    expect(view.pan.x).toBeCloseTo(24);
    expect(view.pan.y).toBeCloseTo(24);
  });
});
