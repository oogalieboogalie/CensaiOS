/**
 * @jest-environment jsdom
 */
// A Sketchpad save that goes out while Pat is already typing a label used to
// put back the older list, so the label's box vanished mid-typing.
import { keepStartedShapes } from '../src/lib/collaboration/windowSketch.js';
import { pendingAppLog } from '../src/lib/appLog/browserLog.js';

const box = { id: 'shape-box-1', type: 'rect', x: 1, y: 1, w: 10, h: 10 };
const samLine = { id: 'shape-sam-1', type: 'arrow', x: 5, y: 5, pts: [] };
const label = { id: 'shape-label-1', type: 'text', x: 2, y: 30, text: 'Made-up label' };

describe('keepStartedShapes', () => {
  test('a text box started while the save waited stays on the pad', () => {
    const out = keepStartedShapes([box, label], [box], [box, samLine], 'win-made-up');
    expect(out).toEqual([box, samLine, label]);
  });

  test('nothing started: the pad shows exactly what was sent', () => {
    expect(keepStartedShapes([box], [box], [box, samLine], 'win-made-up')).toEqual([box, samLine]);
  });

  test('logs the count and window id only, never the words', () => {
    keepStartedShapes([box, label], [box], [box], 'win-log-check');
    const logged = pendingAppLog().filter((entry) => entry.message.startsWith('sketchpad: kept'));
    expect(logged.at(-1)).toMatchObject({ level: 'info', where: 'sketchpad', message: 'sketchpad: kept 1 shape(s) started while saving' });
    expect(logged.at(-1).detail).toMatch(/^window win-[a-z-]+$/);
    expect(JSON.stringify(pendingAppLog())).not.toContain('Made-up label');
  });
});
