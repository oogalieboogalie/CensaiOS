// Rhythm Run keeps scores and the "play together" countdown on the shared
// board, where anyone on the board can write them. The test team planted
// broken records (2026-11-11) and the window showed "[object Object]" as a
// player's name and as who started a match, offered Join for a song nobody
// has, and showed "undefined" after Join. Only real text is shown now, and a
// match is only offered for a built-in song with a countdown that is near.
import {
  MATCH_MAX_WAIT_MS, cleanMatch, cleanPlayer, leaderboard, livePlayers, matchIsPending, readPlayers,
} from '../src/lib/games/rhythm/progress.js';
import { SONGS } from '../src/lib/games/rhythm/songs.js';

const SONG = SONGS[0].id;
const JUNK = /\[object Object\]|undefined|NaN/;
const best = { [`${SONG}:easy`]: { score: 500, accuracy: 90, grade: 'A', maxCombo: 12, at: 1 } };

describe('Rhythm Run: names read from the board', () => {
  test('a name that is an object, a list or a number shows as "Player"', () => {
    for (const name of [{ a: 1 }, ['x'], 42, null, undefined, '', '   ', true]) {
      expect(cleanPlayer({ name, best }).name).toBe('Player');
    }
  });

  test('a real name is kept, trimmed, and cut at 40 letters', () => {
    expect(cleanPlayer({ name: '  Pat   Example ', best }).name).toBe('Pat Example');
    expect(cleanPlayer({ name: 'x'.repeat(90), best }).name).toHaveLength(40);
  });

  test('the score table and "Playing now" never show junk for planted records', () => {
    const players = readPlayers({
      player_a: { name: { toString: 'no' }, best, live: { song: { x: 1 }, score: 'lots', combo: [], at: 1000 } },
      player_b: { name: ['Sam'], best: { [`${SONG}:easy`]: { score: {}, grade: {}, accuracy: 'high' } } },
      player_c: 'not a record',
      title: 'Rhythm Run',
    });
    const shown = [
      ...leaderboard(players, `${SONG}:easy`),
      ...livePlayers(players, 2000),
    ].map((row) => `${row.name} ${row.grade ?? ''} ${row.score} ${row.song ?? ''}`).join(' | ');
    expect(shown).not.toMatch(JUNK);
    expect(shown).toContain('Player');
  });
});

describe('Rhythm Run: a "play together" match read from the board', () => {
  const now = 1_000_000;
  const good = { song: SONG, difficulty: 'easy', startAt: now + 6000, by: 'Sam Example' };

  test('a real match is kept as it is', () => {
    expect(cleanMatch(good)).toEqual(good);
    expect(matchIsPending(cleanMatch(good), now)).toBe(true);
  });

  test('who started it shows as text or not at all, never "[object Object]"', () => {
    for (const by of [{ a: 1 }, ['x'], 7, null]) expect(cleanMatch({ ...good, by }).by).toBe('');
  });

  test('a match for a song nobody has, or the "own track" slot, is not a match', () => {
    for (const song of ['no-such-song', 'custom', '', { id: SONG }, [SONG]]) expect(cleanMatch({ ...good, song })).toBeNull();
  });

  test('a countdown years away is not offered, and neither is one that has passed', () => {
    expect(matchIsPending(cleanMatch({ ...good, startAt: now + MATCH_MAX_WAIT_MS + 1 }), now)).toBe(false);
    expect(matchIsPending(cleanMatch({ ...good, startAt: now + 1e15 }), now)).toBe(false);
    expect(matchIsPending(cleanMatch({ ...good, startAt: now - 1 }), now)).toBe(false);
    expect(matchIsPending(null, now)).toBe(false);
    expect(matchIsPending(cleanMatch({ ...good, startAt: now + MATCH_MAX_WAIT_MS }), now)).toBe(true);
  });
});
