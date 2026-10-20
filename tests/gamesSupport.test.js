import { jest } from '@jest/globals';
import { mergeHighScores, rankOf } from '../src/lib/games/leaderboard.js';
import { DEFAULT_SOUND, loadSoundSettings, saveSoundSettings } from '../src/lib/games/soundSettings.js';
import { claimKeyboard, keyboardClaimed, releaseKeyboard } from '../src/lib/keyboardClaim.js';
import { encodeFrame } from '../src/lib/games/asteroids/wire.js';
import { createGame } from '../src/lib/games/asteroids/engine.js';

const published = [];
jest.unstable_mockModule('../server/collaboration/workspaceHub.js', () => ({
  publishWorkspaceEvent: (workspaceId, event, options) => published.push({ workspaceId, event, options }),
}));
const { handleGameMessage, __resetGameRelayForTests } = await import('../server/ws/gameMessages.js');
const { buildAddSections } = await import('../src/lib/modules/addPaletteItems.js');

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)) };
}

describe('high scores', () => {
  test('best first, ties to whoever got there first, capped at ten, no duplicates', () => {
    const table = mergeHighScores([], [{ name: 'A', score: 100, at: 2 }, { name: 'B', score: 100, at: 1 }, { name: 'C', score: 0, at: 3 }]);
    expect(table.map((r) => r.name)).toEqual(['B', 'A']);
    const again = mergeHighScores(table, [{ name: 'A', score: 100, at: 2 }]);
    expect(again).toHaveLength(2);
    const many = mergeHighScores(again, Array.from({ length: 20 }, (_, i) => ({ name: `P${i}`, score: 10 + i, at: i })));
    expect(many).toHaveLength(10);
    expect(rankOf(many, { name: 'B', score: 100, at: 1 })).toBe(0);
    expect(rankOf(many, { name: 'P0', score: 10, at: 0 })).toBe(-1);
  });
});

describe('sound settings', () => {
  test('remembered between visits and clamped', () => {
    const storage = memoryStorage();
    expect(loadSoundSettings(storage)).toEqual(DEFAULT_SOUND);
    saveSoundSettings({ muted: true, volume: 3 }, storage);
    expect(loadSoundSettings(storage)).toEqual({ muted: true, volume: 1 });
    expect(loadSoundSettings({ getItem: () => '{bad json' })).toEqual(DEFAULT_SOUND);
  });
});

describe('keyboard claim', () => {
  test('a window claims the keyboard and only it can release it', () => {
    const release = claimKeyboard('w1');
    expect(keyboardClaimed()).toBe(true);
    releaseKeyboard('w2');
    expect(keyboardClaimed()).toBe(true);
    release();
    expect(keyboardClaimed()).toBe(false);
  });
});

describe('game relay on the collaboration socket', () => {
  const errors = [];
  const sendJson = (_ws, payload) => errors.push(payload);
  const context = { ws: {}, workspaceId: 'ws1', clientId: 'host', actor: { label: 'Alma' }, spectator: false };
  beforeEach(() => { published.length = 0; errors.length = 0; __resetGameRelayForTests(); });

  test('frames go to everyone else, including guests who can see that window', () => {
    const frame = { type: 'game.frame', windowId: 'w1', ...encodeFrame(createGame({ seed: 1, players: [{ id: 'host', name: 'Alma' }] })) };
    expect(handleGameMessage(frame, context, sendJson, 1000)).toBe(true);
    expect(published).toHaveLength(1);
    const { event, options } = published[0];
    expect(event).toMatchObject({ type: 'game.frame', windowId: 'w1', clientId: 'host' });
    expect(options).toMatchObject({ excludeClientId: 'host', guests: true });
    expect(options.filter({ access: { link: { scope_kind: 'window', scope_id: 'w1' } } })).toBe(true);
    expect(options.filter({ access: { link: { scope_kind: 'window', scope_id: 'other' } } })).toBe(false);
    expect(options.filter({ actor: { type: 'human' } })).toBe(true);
    handleGameMessage(frame, context, sendJson, 1005);
    expect(published).toHaveLength(1);
    handleGameMessage({ ...frame, ships: 'nope' }, context, sendJson, 2000);
    expect(errors).toEqual([{ type: 'error', reason: 'invalid-game-frame' }]);
  });

  test('inputs reach only the host; spectators and other types are not handled here', () => {
    const player = { ...context, clientId: 'p2' };
    handleGameMessage({ type: 'game.input', windowId: 'w1', to: 'host', keys: 4, join: true }, player, sendJson, 1000);
    const { event, options } = published[0];
    expect(event).toMatchObject({ type: 'game.input', to: 'host', keys: 4, join: true, clientId: 'p2' });
    expect(options.filter({ clientId: 'host' })).toBe(true);
    expect(options.filter({ clientId: 'someone' })).toBe(false);
    handleGameMessage({ type: 'game.input', windowId: 'w1', to: 'host', keys: 0, leave: true }, player, sendJson, 1001);
    expect(published).toHaveLength(2);
    handleGameMessage({ type: 'game.input', windowId: 'w1', to: 'host', keys: 4 }, { ...player, spectator: true }, sendJson, 3000);
    expect(published).toHaveLength(2);
    expect(handleGameMessage({ type: 'cursor.move' }, context, sendJson)).toBe(false);
  });
});

describe('Add palette', () => {
  test('a Games section lists Asteroids with its cover', () => {
    const manifests = [{ kind: 'asteroids', label: 'Asteroids', moduleMenu: { show: true, icon: 'Gamepad', hint: 'Arcade shooter' } }];
    const games = buildAddSections({ manifests }).find((s) => s.label === 'Games');
    expect(games.items).toEqual([expect.objectContaining({ id: 'kind:asteroids', cover: 'asteroids', action: { type: 'spawn', kind: 'asteroids' } })]);
  });
});
