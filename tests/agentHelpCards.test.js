import * as Y from 'yjs';
import { snapshotToDoc, valueFromY } from '../server/collab/seedFromSnapshot.js';
import {
  HELP_CARD_SIZE, findHelperWindow, helpCardLinks, helpCardPosition, helpCardWindow,
} from '../server/agent-registry/helpCardShape.js';
import { boardAgentsFromWindows, placeHelpCardInDoc, readDocWindows } from '../server/agent-registry/helpCards.js';

const atlas = { id: 'w-atlas', kind: 'chat', agentId: 'atlas', x: 0, y: 0, w: 400, h: 300 };
const nexus = { id: 'w-nexus', kind: 'chat', agentId: 'nexus', x: 1000, y: 0, w: 400, h: 300 };
const nexusFar = { id: 'w-nexus-far', kind: 'agent', agentId: 'nexus', x: 5000, y: 5000, w: 400, h: 300 };

test('a card sits between the asker and the helper', () => {
  const at = helpCardPosition(atlas, nexus);
  expect(at.x).toBe(700 - HELP_CARD_SIZE.w / 2);
  expect(at.y).toBe(150 - HELP_CARD_SIZE.h / 2);
});

test('windows side by side push the card below the pair instead of on top', () => {
  const at = helpCardPosition(atlas, { ...nexus, x: 400 });
  expect(at.y).toBeGreaterThanOrEqual(300);
});

test('a card never lands on top of a third window', () => {
  const registry = { id: 'w-reg', kind: 'registry', x: 600, y: 0, w: 300, h: 500 };
  const at = helpCardPosition(atlas, nexus, 0, [atlas, nexus, registry]);
  expect(at.y).toBeGreaterThanOrEqual(500);
  expect(helpCardPosition(atlas, nexus, 0, [{ id: 'far', x: 4000, y: 4000, w: 10, h: 10 }])).toEqual(helpCardPosition(atlas, nexus));
});

test('with only the helper, the card goes to its right', () => {
  expect(helpCardPosition(null, nexus)).toEqual({ x: 1448, y: 0 });
});

test('the helper window is the nearest window running that agent, never the asker', () => {
  expect(findHelperWindow([atlas, nexusFar, nexus], 'agent:nexus', atlas).id).toBe('w-nexus');
  expect(findHelperWindow([atlas], 'agent:atlas', atlas)).toBeNull();
  expect(findHelperWindow([atlas, nexus], 'ext:1:x', atlas)).toBeNull();
});

test('card shape and its two link lines', () => {
  const card = helpCardWindow({
    id: 'help-1', fromWin: atlas, toWin: nexus, fromLabel: 'Atlas',
    request: { id: 'r1', cardId: 'agent:nexus', cardName: 'Nexus', task: 'index it', status: 'queued' },
  });
  expect(card).toMatchObject({
    kind: 'agentHelp', executor: 'network', helpRequestId: 'r1', fromWindowId: 'w-atlas', toWindowId: 'w-nexus',
    fromLabel: 'Atlas', toLabel: 'Nexus', status: 'queued', w: HELP_CARD_SIZE.w, h: HELP_CARD_SIZE.h,
  });
  let n = 0;
  expect(helpCardLinks(card, () => `l${++n}`).map((l) => [l.fromId, l.toId])).toEqual([['w-atlas', 'help-1'], ['help-1', 'w-nexus']]);
});

test('an agent tool call writes the card and links into the shared canvas doc', () => {
  const doc = snapshotToDoc({ wins: [atlas, nexus], links: [] });
  let n = 0;
  const card = placeHelpCardInDoc(doc, {
    request: { id: '0b5c1f8e-2a8c-4f7a-9d6e-1c2b3a4d5e6f', cardId: 'agent:nexus', cardName: 'Nexus', task: 'index it', status: 'queued' },
    fromWindowId: 'w-atlas', requesterAgentId: 'atlas', awaitingTool: true, makeId: () => `link-${++n}`,
  });
  expect(card.awaitingTool).toBe(true);
  expect(card.id).toBe('help-0b5c1f8e-2a8c-4f7a-9d6e-1c2b3a4d5e6f');
  const wins = readDocWindows(doc);
  expect(wins.find((w) => w.id === card.id)).toMatchObject({ kind: 'agentHelp', fromLabel: 'Atlas', toLabel: 'Nexus', toWindowId: 'w-nexus' });
  const links = doc.getMap('canvas').get('links');
  expect(links).toBeInstanceOf(Y.Array);
  expect(links.toArray().map(valueFromY).map((l) => l.id)).toEqual(['link-1', 'link-2']);
});

test('discovery learns which agents have a window on the board', () => {
  expect(boardAgentsFromWindows([atlas, nexus, nexusFar, { id: 'd', kind: 'doc' }])).toEqual({
    'agent:atlas': [{ window_id: 'w-atlas', kind: 'chat' }],
    'agent:nexus': [{ window_id: 'w-nexus', kind: 'chat' }, { window_id: 'w-nexus-far', kind: 'agent' }],
  });
});
