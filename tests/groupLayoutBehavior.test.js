import {
  applyPreset,
  cleanLayout,
  getGroupInnerBounds,
} from '../src/lib/layoutAlgo.js';
import {
  captureGroupResize,
  resizeGroupContents,
} from '../src/lib/layout/groupResize.js';
import { windowsInSelection } from '../src/components/canvas/CanvasInteractions.js';

describe('group layout behavior', () => {
  test('resizes group members proportionally without snapping to a new layout', () => {
    const group = { id: 'group-1', x: 0, y: 0, w: 1000, h: 800 };
    const wins = [
      { id: 'files', groupId: group.id, x: 32, y: 32, w: 300, h: 300 },
      { id: 'chat', groupId: group.id, x: 668, y: 32, w: 300, h: 736 },
    ];
    const result = resizeGroupContents(
      captureGroupResize(group, wins, []),
      1500,
      1200,
    );

    expect(result.groupPatch).toEqual({ w: 1500, h: 1200 });
    expect(result.windowPatches[0].patch).toMatchObject({
      x: 32,
      y: 32,
    });
    expect(result.windowPatches[0].patch.w).toBeGreaterThan(300);
    expect(result.windowPatches[1].patch.x).toBeGreaterThan(668);
    expect(result.windowPatches[1].patch.h).toBeGreaterThan(736);
  });

  test('places workspace roles in stable semantic regions', () => {
    const windows = [
      { id: 'terminal', kind: 'terminal' },
      { id: 'chat', kind: 'chat' },
      { id: 'main', kind: 'doc' },
      { id: 'files', kind: 'files' },
      { id: 'idea', kind: 'idea' },
    ];
    const root = applyPreset('SEMANTIC_WORKSPACE', windows);
    const group = { x: 0, y: 0, w: 1800, h: 1400 };
    const updates = Object.fromEntries(
      cleanLayout(root, getGroupInnerBounds(group)).map((item) => [item.id, item.patch]),
    );

    expect(updates.idea.y).toBeLessThan(updates.files.y);
    expect(updates.files.x).toBeLessThan(updates.main.x);
    expect(updates.chat.x).toBeGreaterThan(updates.main.x);
    expect(updates.terminal.y).toBeGreaterThan(updates.main.y);
  });

  test('selects windows whose centers are inside a drag rectangle', () => {
    const wins = [
      { id: 'a', x: 0, y: 0, w: 100, h: 100 },
      { id: 'b', x: 150, y: 150, w: 100, h: 100 },
      { id: 'pinned', pinned: true, x: 20, y: 20, w: 40, h: 40 },
    ];

    expect(windowsInSelection(wins, { x: -10, y: -10, w: 130, h: 130 })).toEqual(['a']);
  });
});
