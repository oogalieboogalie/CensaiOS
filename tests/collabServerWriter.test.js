import * as Y from 'yjs';
import { upsertWindowInDoc, mirrorWindowToCanvas } from '../server/collab/serverWriter.js';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';

const win = (extra = {}) => ({ id: 'agent-win', kind: 'code', x: 10, y: 20, w: 300, h: 200, ...extra });

describe('server-side canvas CRDT writer', () => {
  test('an agent-spawned window lands in the doc browsers read', () => {
    const doc = new Y.Doc();
    expect(upsertWindowInDoc(doc, win({ title: 'Report' }))).toBe(true);
    expect(readDocState(doc, { wins: [] }).wins).toEqual([win({ title: 'Report' })]);
  });

  test('an agent update only rewrites changed fields, so a concurrent human move survives', () => {
    const server = new Y.Doc();
    const browser = new Y.Doc();
    upsertWindowInDoc(server, win({ content: 'v1' }));
    Y.applyUpdate(browser, Y.encodeStateAsUpdate(server));
    // Concurrently: the human drags the window, the agent appends content.
    browser.getMap('canvas').get('windows').get('agent-win').set('x', 900);
    upsertWindowInDoc(server, win({ content: 'v2' }));
    Y.applyUpdate(server, Y.encodeStateAsUpdate(browser, Y.encodeStateVector(server)));
    Y.applyUpdate(browser, Y.encodeStateAsUpdate(server, Y.encodeStateVector(browser)));
    for (const doc of [server, browser]) {
      expect(readDocState(doc, { wins: [] }).wins[0]).toEqual(expect.objectContaining({ x: 900, content: 'v2' }));
    }
  });

  test('an agent rewriting a doc body merges with a person typing in it', () => {
    const server = new Y.Doc();
    const browser = new Y.Doc();
    const base = { wins: [] };
    writeStateToDoc(browser, base, { wins: [win({ kind: 'doc', text: 'Intro.\nBody.' })] }, 'local');
    Y.applyUpdate(server, Y.encodeStateAsUpdate(browser));
    const typed = readDocState(browser, base);
    writeStateToDoc(browser, typed, { wins: [{ ...typed.wins[0], text: 'Intro, edited.\nBody.' }] }, 'local');
    upsertWindowInDoc(server, win({ kind: 'doc', text: 'Intro.\nBody.\nAgent note.' }));
    Y.applyUpdate(server, Y.encodeStateAsUpdate(browser, Y.encodeStateVector(server)));
    Y.applyUpdate(browser, Y.encodeStateAsUpdate(server, Y.encodeStateVector(browser)));
    for (const doc of [server, browser]) {
      expect(readDocState(doc, base).wins[0].text).toBe('Intro, edited.\nBody.\nAgent note.');
    }
  });

  test('rejects windows without geometry and is a no-op when no collaboration server runs', async () => {
    expect(upsertWindowInDoc(new Y.Doc(), { id: 'x' })).toBe(false);
    await expect(mirrorWindowToCanvas('workspace-a', win())).resolves.toBe(false);
  });
});
