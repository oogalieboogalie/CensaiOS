// The Rhythm Run test-team module: registered, its steps in order, and what
// it plants on the board is something the window's own record cleaners can
// read without junk. The browser run itself is `npm run test-team -- rhythmRun`.
import rhythmRun from '../scripts/test-team/modules/rhythmRun.mjs';
import { BROKEN_PLAYERS, brokenMatches } from '../scripts/test-team/modules/rhythmRunRedTeam.mjs';
import { DIFFICULTY, SONG, SONG_MS } from '../scripts/test-team/modules/rhythmSteps.mjs';
import { MODULES, pickModules } from '../scripts/test-team/modules/index.mjs';
import { songById } from '../src/lib/games/rhythm/songs.js';
import { DIFFICULTIES, sequence } from '../src/lib/games/rhythm/sequence.js';
import { cleanMatch, leaderboard, livePlayers, readPlayers } from '../src/lib/games/rhythm/progress.js';
import { windowMeta } from '../src/components/windows/rhythm/meta.js';

/** Runs the module with a check that only writes down each step's part and name. */
async function stepsOf(mod) {
  const steps = [];
  const check = async (part, name) => { steps.push([part, name]); };
  await mod.run({ pat: {}, sam: {}, check, typed: [] });
  return steps;
}

describe('Rhythm Run test-team module', () => {
  it('is registered and can be asked for by name', () => {
    expect(rhythmRun.id).toBe('rhythmRun');
    expect(rhythmRun.label).toMatch(/^Rhythm Run: /);
    expect(typeof rhythmRun.run).toBe('function');
    expect(MODULES).toContain(rhythmRun);
    expect(MODULES.filter((m) => m.id === 'rhythmRun')).toHaveLength(1);
    expect(pickModules('rhythmRun')).toEqual([rhythmRun]);
  });

  it('opens the window the Add menu really lists', () => {
    expect(windowMeta.kind).toBe('rhythmRun');
    expect(windowMeta.moduleMenu.label).toBe('Rhythm Run');
  });

  it('walks first, then hunts bugs, then the red team, for one person and for two', async () => {
    const steps = await stepsOf(rhythmRun);
    const parts = steps.map(([part]) => part);
    expect(parts.filter((p) => p === 'walk').length).toBeGreaterThanOrEqual(5);
    expect(parts.filter((p) => p === 'hunt').length).toBeGreaterThanOrEqual(2);
    expect(parts.filter((p) => p === 'redteam').length).toBeGreaterThanOrEqual(3);
    expect(parts.lastIndexOf('walk')).toBeLessThan(parts.indexOf('redteam'));
    expect(parts.slice(parts.indexOf('redteam')).every((p) => p === 'redteam')).toBe(true);
    const names = steps.map(([, name]) => name).join('\n');
    expect(names).toMatch(/Pat opens Rhythm Run from the Add menu/);
    expect(names).toMatch(/Sam's screen lists Pat under "Playing now"/);
    expect(names).toMatch(/Pat sees the invite, joins, and both see each other playing/);
    expect(names).toMatch(/after a reload/);
    expect(new Set(steps.map(([, name]) => name)).size).toBe(steps.length);
  });

  it('plays a song that exists, on a difficulty that exists, and waits long enough for it to end', () => {
    const song = songById(SONG.id);
    expect(song?.title).toBe(SONG.title);
    expect(DIFFICULTIES.map((d) => d.label)).toContain(DIFFICULTY);
    expect(SONG_MS).toBeGreaterThan((sequence(song).duration + 5) * 1000);
  });

  it('plants records the window can read: plain-string names, real scores and known keys', () => {
    const players = readPlayers(BROKEN_PLAYERS);
    const rows = leaderboard(players, 'night-drive:easy');
    for (const row of rows) {
      expect(typeof row.name).toBe('string');
      expect(Number.isFinite(row.score)).toBe(true);
      expect(row.score).toBeLessThanOrEqual(1e9);
      expect(row.grade).toMatch(/^[SABCD]$/);
    }
    expect(rows.map((r) => r.name)).toContain('Sam Example');
    expect(rows[0].score).toBe(1e9);
    expect(Object.values(players).every((p) => !Object.keys(p.best).some((k) => k.endsWith(':impossible')))).toBe(true);
    for (const row of livePlayers(players, Date.now())) {
      expect(typeof row.song).toBe('string');
      expect(Number.isFinite(row.score)).toBe(true);
    }
  });

  it('plants matches the cleaner either drops or keeps as plain text', () => {
    const cleaned = brokenMatches(1_000).map(cleanMatch);
    expect(cleaned.slice(0, 4)).toEqual([null, null, null, null]);
    for (const m of cleaned.filter(Boolean)) {
      expect(typeof m.by).toBe('string');
    }
  });

  // Found while writing this module (src/lib/games/rhythm/progress.js is not this unit's to
  // change): a name or starter that is an object, not text, shows as "[object Object]".
  // The red team's "broken score records" and "broken matches" steps report it in the browser.
  it.todo('a planted player name that is an object shows as plain words, not "[object Object]"');
  it.todo('a planted "play together" starter that is an object shows as plain words, not "[object Object]"');
});
