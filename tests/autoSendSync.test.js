import * as Y from 'yjs';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import { CANVAS_ROOT } from '../shared/collab/ySchema.js';

const win = (id, extra = {}) => ({ id, kind: 'chat', x: 0, y: 0, w: 420, h: 360, ...extra });

function pair() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  a.on('update', (update, origin) => { if (origin !== 'remote') Y.applyUpdate(b, update, 'remote'); });
  b.on('update', (update, origin) => { if (origin !== 'remote') Y.applyUpdate(a, update, 'remote'); });
  return { a, b };
}

describe('autoSend stays on this browser', () => {
  test('a shared autoSend flag never arrives in another browser', () => {
    const { a, b } = pair();
    const base = { wins: [win('c1', { msgs: [{ from: 'me', text: 'run the tests' }] })] };
    writeStateToDoc(a, null, base, 'local');
    const windows = a.getMap(CANVAS_ROOT).get('windows');
    a.transact(() => {
      windows.get('c1').set('autoSend', true);
      windows.get('c1').set('autoSendBy', 'someone-else');
      windows.get('c1').set('title', 'Still a chat');
    });
    const seen = readDocState(b, base).wins[0];
    expect(seen.title).toBe('Still a chat');
    expect(seen.autoSend).toBeUndefined();
    expect(seen.autoSendBy).toBeUndefined();
  });

  test('this browser keeps the autoSend flag it set for itself', () => {
    const { a } = pair();
    const base = { wins: [win('c1')] };
    writeStateToDoc(a, null, base, 'local');
    const local = { wins: [{ ...base.wins[0], autoSend: true }] };
    writeStateToDoc(a, base, local, 'local');
    expect(readDocState(a, local).wins[0].autoSend).toBe(true);
    const windows = a.getMap(CANVAS_ROOT).get('windows');
    expect(windows.get('c1').has('autoSend')).toBe(false);
  });
});
