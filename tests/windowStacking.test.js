import * as Y from 'yjs';
import { raiseWindow, stackLevels } from '../src/lib/windowStacking.js';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';

const win = (id, zIndex) => ({ id, kind: 'note', x: 0, y: 0, w: 100, h: 100, ...(zIndex === undefined ? {} : { zIndex }) });
const order = (wins) => {
  const levels = stackLevels(wins);
  return [...wins].sort((a, b) => levels.get(a.id) - levels.get(b.id)).map((w) => w.id);
};

describe('shared window stacking', () => {
  test('windows without a zIndex keep their old array order, above numbered ones', () => {
    expect(order([win('a'), win('b'), win('c')])).toEqual(['a', 'b', 'c']);
    expect(order([win('a'), win('b', 5), win('c', 1)])).toEqual(['c', 'b', 'a']);
    expect(order([win('a', null), win('b', 2)])).toEqual(['b', 'a']);
  });

  test('raising puts the window on top without reshuffling the rest', () => {
    const wins = [win('a'), win('b'), win('c')];
    const raised = raiseWindow(wins, 'a');
    expect(order(raised)).toEqual(['b', 'c', 'a']);
    expect(raised.map((w) => w.id)).toEqual(['a', 'b', 'c']);
    expect(order(raiseWindow(raised, 'b'))).toEqual(['c', 'a', 'b']);
  });

  test('raising the top window or an unknown id changes nothing', () => {
    const wins = [win('a', 1), win('b', 2)];
    expect(raiseWindow(wins, 'b')).toBe(wins);
    expect(raiseWindow(wins, 'zzz')).toBe(wins);
  });

  test('only windows that actually move get a new object', () => {
    const wins = [win('a', 1), win('b', 2), win('c', 3)];
    const raised = raiseWindow(wins, 'a');
    expect(raised[1]).toBe(wins[1]);
    expect(raised[2]).toBe(wins[2]);
    expect(raised[0].zIndex).toBe(4);
  });

  test('a window brought forward in one browser is on top in the other', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    a.on('update', (u) => Y.applyUpdate(b, u));
    const base = { wins: [win('w1'), win('w2')] };
    writeStateToDoc(a, null, base, 'local');
    const raised = raiseWindow(base.wins, 'w1');
    writeStateToDoc(a, base, { wins: raised }, 'local');
    expect(order(readDocState(b, base).wins)).toEqual(['w2', 'w1']);
  });

  test('two people raising different windows at once agree on one order', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    const sync = () => {
      Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
      Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
    };
    const base = { wins: [win('w1', 1), win('w2', 2), win('w3', 3)] };
    writeStateToDoc(a, null, base, 'local');
    sync();
    writeStateToDoc(a, base, { wins: raiseWindow(base.wins, 'w1') }, 'local');
    writeStateToDoc(b, base, { wins: raiseWindow(base.wins, 'w2') }, 'local');
    sync();
    const orderA = order(readDocState(a, base).wins);
    expect(order(readDocState(b, base).wins)).toEqual(orderA);
    expect(orderA[0]).toBe('w3');
  });
});
