import { jest } from '@jest/globals';
import * as Y from 'yjs';

// One board document stands in for the live canvas: the server tool writes
// the call into it, and a fake browser on the board answers it.
let doc;
jest.unstable_mockModule('../server/collab/liveDoc.js', () => ({
  openCanvasDocReader: async () => (doc ? { doc, close: async () => undefined } : null),
  transactCanvasDoc: async (_ws, mutate) => { if (!doc) return false; doc.transact(() => mutate(doc)); return true; },
}));

const { readModule, useModule } = await import('../server/modules/moduleAgentTools.js');
const { CANVAS_ROOT } = await import('../server/collab/ySchema.js');
const { valueToY } = await import('../server/collab/seedFromSnapshot.js');
const { loadModuleExamples } = await import('../server/modules/examples.js');
const { claimPatch, finishPatch, runningPatch } = await import('../src/lib/modules/moduleAgentCalls.js');

function boardWith(windows) {
  doc = new Y.Doc();
  const map = new Y.Map();
  doc.getMap(CANVAS_ROOT).set('windows', map);
  for (const win of windows) map.set(win.id, valueToY(win));
}

function windowRecord(id) {
  return doc.getMap(CANVAS_ROOT).get('windows').get(id);
}

// A browser on the board: claims a waiting call, runs it, writes the answer.
function browserAnswers(run) {
  const seen = new Set();
  const onUpdate = () => {
    doc.getMap(CANVAS_ROOT).get('windows').forEach((value, id) => {
      const call = value.get('agentCall')?.toJSON?.();
      if (!call || call.status !== 'waiting' || seen.has(call.id)) return;
      seen.add(call.id);
      setTimeout(() => {
        const put = (next) => doc.transact(() => windowRecord(id).set('agentCall', valueToY(next)));
        const claimed = claimPatch(call, 'tab-1');
        put(claimed);
        put(runningPatch(claimed));
        try { put(finishPatch(claimed, { result: run(call) })); } catch (error) { put(finishPatch(claimed, { error: error.message })); }
      }, 5);
    });
  };
  doc.on('update', onUpdate);
  return () => doc.off('update', onUpdate);
}

let listing;
beforeAll(async () => {
  listing = (await loadModuleExamples()).find(e => e.id === 'listing-pipeline');
});

beforeEach(() => {
  boardWith([
    { id: 'm1', kind: 'module', status: 'ready', title: 'Listing pipeline', manifest: listing.manifest, source: listing.source, moduleData: { listings: [{ address: '14 Alder Way', stage: 'Lead' }] } },
    { id: 'building', kind: 'module', status: 'building', manifest: listing.manifest, source: '' },
    { id: 'hello', kind: 'helloFactory', manifest: { manifest: 3, name: 'Hello Factory', permissions: ['storage'], tools: [{ name: 'set_note', description: 'Change the note.', input: { text: 'string' } }] } },
    { id: 'doc1', kind: 'doc', title: 'Notes' },
  ]);
});

test('read_module lists the modules on the board, then describes one with its tools and data', async () => {
  const list = await readModule({ workspaceId: 'w1' });
  expect(list).toMatch(/^2 modules on this board/);
  expect(list).toContain('"Listing pipeline" (window id m1): tools add_listing, move_listing, list_listings');
  expect(list).toContain('"Hello Factory" (window id hello)');
  expect(list).not.toContain('building');

  const one = await readModule({ workspaceId: 'w1', windowId: 'm1' });
  expect(one).toContain('May: Save its data on the board.');
  expect(one).toContain('- add_listing(address: string, price?: number, stage?: string (Lead|Listed|Under contract|Closed)): Add a listing to the board.');
  expect(one).toContain('14 Alder Way');
  expect(await readModule({ workspaceId: 'w1', windowId: 'doc1' })).toMatch(/^Error: window doc1 is not a module/);
});

test('use_module presses a tool through the board and returns what the module answered', async () => {
  const stop = browserAnswers(call => ({ added: call.input.address, stage: call.input.stage }));
  const out = await useModule({ workspaceId: 'w1', windowId: 'm1', tool: 'add_listing', input: { address: '12 Oak St', price: '525000', stage: 'Listed' }, by: 'Atlas' });
  stop();
  expect(out).toBe('Used "add_listing" on "Listing pipeline". The module answered: {"added":"12 Oak St","stage":"Listed"}');
  const call = windowRecord('m1').get('agentCall').toJSON();
  expect(call).toMatchObject({ by: 'Atlas', tool: 'add_listing', status: 'done', runner: 'tab-1', input: { address: '12 Oak St', price: 525000, stage: 'Listed' } });
});

test('a module error comes back to the agent in plain words', async () => {
  const stop = browserAnswers(() => { throw new Error('No listing matches 1 Main'); });
  const out = await useModule({ workspaceId: 'w1', windowId: 'm1', tool: 'move_listing', input: { address: '1 Main', stage: 'Closed' } });
  stop();
  expect(out).toBe('Error: "Listing pipeline" could not move listing: No listing matches 1 Main');
});

test('undeclared tools and bad input never reach the board', async () => {
  expect(await useModule({ workspaceId: 'w1', windowId: 'm1', tool: 'delete_everything' }))
    .toMatch(/has no "delete_everything" tool\. Its tools: add_listing, move_listing, list_listings/);
  expect(await useModule({ workspaceId: 'w1', windowId: 'm1', tool: 'add_listing', input: { stage: 'Lead' } }))
    .toMatch(/^Error: "address" is required/);
  expect(await useModule({ workspaceId: 'w1', windowId: 'doc1', tool: 'x' })).toMatch(/not a module/);
  expect(windowRecord('m1').get('agentCall')).toBeUndefined();
});

test('with nobody on the board, the call expires and the agent is told why', async () => {
  const out = await useModule({ workspaceId: 'w1', windowId: 'hello', tool: 'set_note', input: { text: 'hi' }, timeoutMs: 300 });
  expect(out).toMatch(/nobody has this board open/);
  expect(windowRecord('hello').get('agentCall').toJSON().status).toBe('expired');
});

test('without a running board the tools say so', async () => {
  doc = null;
  expect(await readModule({ workspaceId: 'w1' })).toMatch(/board is not running/);
  expect(await useModule({ workspaceId: 'w1', windowId: 'm1', tool: 'add_listing' })).toMatch(/board is not running/);
});
