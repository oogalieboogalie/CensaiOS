// An agent saved with another model is told to the board's other members
// (server/ws/agentChangeMessages.js): never to guests, never from a guest or a
// spectator, and one browser's changes go out at most every 250 ms, the
// latest of those said sooner once the gap has passed. All people are made up.
import { jest } from '@jest/globals';
import { __resetAgentChangeRelayForTests, handleAgentChangeMessage } from '../server/ws/agentChangeMessages.js';
import { __resetWorkspaceHubForTests, joinWorkspaceClient } from '../server/collaboration/workspaceHub.js';

const BOARD = 'made-up-board';
const PAT = { type: 'human', id: '7', label: 'Pat Example' };
const SAM = { type: 'human', id: '8', label: 'Sam Example' };
const GUEST = { type: 'guest', id: 'guest-1', label: 'Made-up guest' };
const CHANGED = { type: 'agent.changed', agentId: 'made-up-agent' };

let heard;
const listen = (clientId, actor, extra = {}) => {
  heard[clientId] = [];
  joinWorkspaceClient({ workspaceId: BOARD, clientId, actor, send: (event) => heard[clientId].push(event), ...extra });
};
const from = (clientId, actor, extra = {}) => ({ workspaceId: BOARD, clientId, actor, ws: {}, ...extra });

beforeEach(() => {
  jest.useFakeTimers();
  __resetWorkspaceHubForTests();
  __resetAgentChangeRelayForTests();
  heard = {};
  listen('pat', PAT);
  listen('sam', SAM);
  listen('guest', GUEST);
});

afterEach(() => {
  __resetAgentChangeRelayForTests();
  jest.useRealTimers();
});

test("Pat's change reaches Sam, but not Pat or a guest on the board", () => {
  expect(handleAgentChangeMessage(CHANGED, from('pat', PAT), () => {}, 1_000)).toBe(true);
  expect(heard.sam).toEqual([{ ...CHANGED, clientId: 'pat', actor: PAT }]);
  expect(heard.pat).toEqual([]);
  expect(heard.guest).toEqual([]);
});

test('a guest or a spectator saying an agent changed reaches no one', () => {
  expect(handleAgentChangeMessage(CHANGED, from('guest', GUEST), () => {}, 1_000)).toBe(true);
  expect(handleAgentChangeMessage(CHANGED, from('pat', PAT, { spectator: true }), () => {}, 2_000)).toBe(true);
  expect(heard.sam).toEqual([]);
});

test('an id that is not an agent id is refused, and other types are left to other relays', () => {
  const sent = [];
  const sendJson = (_ws, payload) => sent.push(payload);
  for (const agentId of ['', 'made up', 'x'.repeat(97), '../made-up', { id: 'made-up' }]) {
    handleAgentChangeMessage({ type: 'agent.changed', agentId }, from('pat', PAT), sendJson, 1_000);
  }
  expect(sent).toEqual(Array(5).fill({ type: 'error', reason: 'invalid-agent-change' }));
  expect(heard.sam).toEqual([]);
  expect(handleAgentChangeMessage({ type: 'dock.cast' }, from('pat', PAT), sendJson, 1_000)).toBe(false);
});

test('changes said sooner than 250 ms apart wait, and only the latest goes out once the gap has passed', () => {
  const say = (agentId, at) => handleAgentChangeMessage({ type: 'agent.changed', agentId }, from('pat', PAT), () => {}, at);
  say('made-up-agent', 1_000);
  for (const at of [1_050, 1_100]) say('made-up-agent', at);
  say('made-up-other-agent', 1_200);
  expect(heard.sam.map((event) => event.agentId)).toEqual(['made-up-agent']);
  // The wait began with the one said at 1,050, so it ends 200 ms later, at 1,250.
  jest.advanceTimersByTime(199);
  expect(heard.sam).toHaveLength(1);
  jest.advanceTimersByTime(1);
  expect(heard.sam.map((event) => event.agentId)).toEqual(['made-up-agent', 'made-up-other-agent']);
  // The gap now counts from when that one went out (1,250): one said at 1,300 waits too.
  say('made-up-agent', 1_300);
  expect(heard.sam).toHaveLength(2);
  jest.advanceTimersByTime(200);
  expect(heard.sam).toHaveLength(3);
  say('made-up-agent', 2_000);
  expect(heard.sam).toHaveLength(4);
  expect(heard.pat).toEqual([]);
});

test("each browser has its own gap: Sam's change goes out at once right after Pat's", () => {
  handleAgentChangeMessage(CHANGED, from('pat', PAT), () => {}, 1_000);
  handleAgentChangeMessage(CHANGED, from('sam', SAM), () => {}, 1_010);
  expect(heard.sam).toHaveLength(1);
  expect(heard.pat).toEqual([{ ...CHANGED, clientId: 'sam', actor: SAM }]);
});
