/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react';

// The board's own lines go into censaiOS's log file (src/lib/appLog/browserLog.js).
// They never name a window's file, a canvas group or what an Auction Watcher
// watch looks for: a group drag counts windows by kind, a new watch is named
// by its id, and a failed goals or milestones address hides the group's name.
// Made-up names for Pat Example.
const GROUP = 'Made-up Garden Plans';
const DOC = 'made-up-taxes-2026.docx';
const NOTE = 'Made-up grocery list';
const WATCH = "made-up grandma's ring";
const NAMED = /made-up|garden|taxes|grocery|grandma/i;

const sent = [];
const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
// The server's side of every request; the board's log wraps window.fetch around it.
const server = jest.fn(async (url, init = {}) => {
  const path = String(url);
  if (path === '/api/logs/browser') { sent.push(...JSON.parse(init.body).entries); return reply(202, {}); }
  if (/^\/api\/(goals|milestones)\//.test(path)) return reply(500, { error: 'Goals are unavailable right now.' });
  if (path.startsWith('/api/auction-watcher/watches') && init.method === 'POST') {
    return reply(200, { watch: { id: 7, site: 'shopgoodwill', query: JSON.parse(init.body).query }, check: { matches: 0 } });
  }
  if (path.startsWith('/api/auction-watcher/watches')) return reply(200, { watches: [], ebayKey: false });
  return reply(200, []);
});
window.fetch = server;

const { flushAppLog, installBrowserLog } = await import('../src/lib/appLog/browserLog.js');
await import('../src/lib/store.js'); // loads first, as in the app (store.js <-> storeCanvasActions.js)
const { createCanvasActions } = await import('../src/lib/storeCanvasActions.js');
const { useAuctionWatcher } = await import('../src/components/auctionWatcher/useAuctionWatcher.js');
const { useGroupData } = await import('../src/components/group/useGroupData.js');

installBrowserLog(window);
/** What the board sent to the log, as the log file gets it; only these windows' lines. */
const said = () => {
  flushAppLog();
  return sent.map((e) => e.message).filter((m) => /^(groups|auction-watcher):|\/api\/(goals|milestones)\//.test(m));
};
beforeEach(() => { sent.length = 0; });

test('a group drag counts the windows it leaves behind or picks up by kind, never their titles or the group\'s name', () => {
  const root = { type: 'split', axis: 'vertical', ratio: 0.5, first: { type: 'leaf', windowId: 'a' }, second: { type: 'leaf', windowId: 'b' } };
  const tile = (id, x) => ({ id, kind: 'chat', title: `${GROUP} chat`, groupId: 'g1', x, y: 0, w: 440, h: 590 });
  const doc = { id: 'd', kind: 'document', title: DOC, x: 300, y: 200, w: 300, h: 200 };
  const sticky = { id: 's', kind: 'sticky', title: NOTE, groupId: 'g1', x: 100, y: 300, w: 200, h: 160 };
  let state = {
    wins: [tile('a', 0), tile('b', 450), doc, sticky],
    canvasGroups: [{ id: 'g1', label: GROUP, x: 0, y: 0, w: 900, h: 600, root }, { id: 'g2', label: `${GROUP} ideas`, x: 2000, y: 0, w: 900, h: 600 }],
  };
  const actions = createCanvasActions((fn) => { state = { ...state, ...(typeof fn === 'function' ? fn(state) : fn) }; }, () => state);

  actions.moveGroup('g1', 10, 10, true); // tiled: carries its two tiles, leaves the Document and the Sticky
  state = { ...state, wins: state.wins.map((w) => (w.id === 'd' ? { ...w, x: 2300 } : w)) };
  actions.moveGroup('g2', 10, 10, true); // no layout: picks up the Document now inside it

  expect(said()).toEqual([
    'groups: a group drag left behind 2 windows with no tile (document, sticky)',
    'groups: a group drag picked up 1 window it does not tile (document)',
  ]);
  expect(JSON.stringify(sent)).not.toMatch(NAMED);
});

test('a new watch is logged by its id and site, never its words', async () => {
  const { result } = renderHook(() => useAuctionWatcher({ win: {}, onUpdate: () => {} }));
  await waitFor(() => expect(result.current.watches).toEqual([]));
  await act(async () => { await result.current.addWatch({ site: 'shopgoodwill', query: WATCH, intervalMinutes: 30 }); });

  expect(said()).toEqual(['auction-watcher: watch 7 added on shopgoodwill']);
  expect(server).toHaveBeenCalledWith('/api/auction-watcher/watches', expect.objectContaining({ body: expect.stringContaining('grandma') }));
  expect(JSON.stringify(sent)).not.toMatch(NAMED);
});

test('a group\'s goals and milestones that fail to load are logged without the group\'s name', async () => {
  renderHook(() => useGroupData(GROUP, {}));
  await waitFor(() => expect(said()).toHaveLength(2));

  expect(said().sort()).toEqual(['GET /api/goals/[redacted] returned 500', 'GET /api/milestones/[redacted] returned 500']);
  expect(server.mock.calls.map(([url]) => url)).toContain('/api/goals/Made-up%20Garden%20Plans');
  expect(JSON.stringify(sent)).not.toMatch(NAMED);
});
