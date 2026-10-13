// Rhythm Run: songs parse into in-time charts, timing is judged fairly,
// any track can be charted from its audio, and scores from two players
// merge on the shared board.
import * as Y from 'yjs';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import { SONGS, songById } from '../src/lib/games/rhythm/songs.js';
import { DIFFICULTIES, LANES, STEPS_PER_BAR, chartFor, laneMap, midiOf, sequence, tokens } from '../src/lib/games/rhythm/sequence.js';
import { MISS_AFTER, accuracy, createRun, gradeFor, multiplierFor, press, summary, sweep } from '../src/lib/games/rhythm/judge.js';
import { chartFromAudio } from '../src/lib/games/rhythm/onsets.js';
import { bestKey, cleanMatch, leaderboard, livePlayers, playerField, readPlayers, recordBest } from '../src/lib/games/rhythm/progress.js';
import { buildAddSections } from '../src/lib/modules/addPaletteItems.js';
import { WINDOW_MANIFESTS } from '../src/lib/windowManifest.js';

describe('songs and charts', () => {
  test.each(SONGS.map((s) => [s.id, s]))('%s: every bar has 16 steps and real notes', (id, song) => {
    for (const section of song.sections) {
      for (const voice of ['lead', 'bass', 'drums']) {
        for (const bar of section[voice] || []) {
          expect(tokens(bar)).toHaveLength(STEPS_PER_BAR);
          for (const tok of tokens(bar)) {
            if (voice === 'drums') expect(['k', 's', 'h', '.']).toContain(tok);
            else expect(tok === '.' || tok === '-' || midiOf(tok) !== null).toBe(true);
          }
        }
      }
    }
  });

  test.each(SONGS.map((s) => [s.id, s]))('%s: charts get denser with difficulty and stay on the grid', (id, song) => {
    const { duration, step } = sequence(song);
    expect(duration).toBeGreaterThan(30);
    expect(duration).toBeLessThan(120);
    const counts = DIFFICULTIES.map((d) => chartFor(song, d.id).length);
    expect(counts[0]).toBeGreaterThan(15);
    expect(counts[0]).toBeLessThan(counts[1]);
    expect(counts[1]).toBeLessThanOrEqual(counts[2]);
    const hard = chartFor(song, 'hard');
    const lanesUsed = new Set(hard.map((n) => n.lane));
    expect(lanesUsed.size).toBe(LANES);
    for (const n of hard) expect(Math.abs(n.t / step - Math.round(n.t / step))).toBeLessThan(1e-6);
    const easy = chartFor(song, 'easy');
    for (let i = 1; i < easy.length; i += 1) expect(easy[i].t - easy[i - 1].t).toBeGreaterThanOrEqual(step * 4 * 0.99);
  });

  test('note names and lanes', () => {
    expect(midiOf('A4')).toBe(69);
    expect(midiOf('C#5')).toBe(73);
    expect(midiOf('-')).toBeNull();
    const lanes = laneMap([60, 62, 64, 65, 67, 69, 71, 72]);
    expect(lanes.get(60)).toBe(0);
    expect(lanes.get(72)).toBe(3);
    expect(songById('night-drive').bpm).toBe(116);
  });
});

describe('judging', () => {
  const chart = [{ id: 0, t: 1, lane: 0 }, { id: 1, t: 1.5, lane: 1 }, { id: 2, t: 2, lane: 2 }, { id: 3, t: 2, lane: 3 }];

  test('perfect, great and ok windows, nearest note wins', () => {
    const run = createRun(chart);
    expect(press(run, 0, 1.02).kind).toBe('perfect');
    expect(press(run, 1, 1.43).kind).toBe('great');
    expect(press(run, 2, 2.12).kind).toBe('ok');
    expect(run.combo).toBe(3);
    expect(run.score).toBe(100 + 70 + 40);
  });

  test('a press in the wrong lane or too early scores nothing and keeps the combo', () => {
    const run = createRun(chart);
    press(run, 0, 1);
    expect(press(run, 3, 1.0)).toBeNull();
    expect(press(run, 1, 1.2)).toBeNull();
    expect(run.combo).toBe(1);
  });

  test('a note that slides past is a miss and breaks the combo', () => {
    const run = createRun(chart);
    press(run, 0, 1);
    sweep(run, 1.5 + MISS_AFTER + 0.01);
    expect(run.counts.miss).toBe(1);
    expect(run.combo).toBe(0);
  });

  test('one press hits one note only', () => {
    const run = createRun([{ id: 0, t: 1, lane: 0 }, { id: 1, t: 1.06, lane: 0 }]);
    press(run, 0, 1.03);
    expect(run.hit.size).toBe(1);
  });

  test('the multiplier climbs every ten in a row, up to four', () => {
    expect([0, 9, 10, 25, 39, 200].map(multiplierFor)).toEqual([1, 1, 2, 3, 4, 4]);
  });

  test('a clean run is an S', () => {
    const run = createRun(chart);
    for (const n of chart) press(run, n.lane, n.t);
    expect(accuracy(run)).toBe(1);
    expect(summary(run)).toMatchObject({ grade: 'S', accuracy: 100, maxCombo: 4, notes: 4 });
    expect(gradeFor(0.6)).toBe('C');
  });
});

describe('charting your own track', () => {
  // Synthetic audio: clicks every half second, alternating dull and bright.
  function clickTrack(seconds = 8, rate = 22050, every = 0.5) {
    const out = new Float32Array(seconds * rate);
    for (let k = 0; k < (seconds - 0.5) / every; k += 1) {
      const start = Math.floor((k * every + 0.25) * rate);
      const bright = k % 2 === 1;
      for (let i = 0; i < rate * 0.05; i += 1) {
        const env = Math.exp(-i / (rate * 0.01));
        out[start + i] = env * (bright ? Math.sin(i * 2.6) : Math.sin(i * 0.05)) * 0.8;
      }
    }
    return { out, rate };
  }

  test('finds the hits within a frame and spreads them over the lanes', () => {
    const { out, rate } = clickTrack();
    const chart = chartFromAudio(out, rate, 'normal');
    expect(chart.length).toBeGreaterThanOrEqual(14);
    expect(chart.length).toBeLessThanOrEqual(17);
    for (const n of chart) {
      const nearest = Math.round((n.t - 0.25) / 0.5) * 0.5 + 0.25;
      expect(Math.abs(n.t - nearest)).toBeLessThan(0.03);
    }
    const dull = chart.filter((n) => Math.round((n.t - 0.25) / 0.5) % 2 === 0).map((n) => n.lane);
    const bright = chart.filter((n) => Math.round((n.t - 0.25) / 0.5) % 2 === 1).map((n) => n.lane);
    expect(Math.max(...dull)).toBeLessThan(Math.min(...bright));
  });

  test('easy keeps notes further apart', () => {
    const { out, rate } = clickTrack(8, 22050, 0.25);
    expect(chartFromAudio(out, rate, 'easy').length).toBeLessThan(chartFromAudio(out, rate, 'hard').length);
  });

  test('silence charts nothing', () => {
    expect(chartFromAudio(new Float32Array(44100), 44100)).toEqual([]);
  });
});

describe('scores on the board', () => {
  test('best scores keep the higher one, and the live score clears at the end', () => {
    const key = bestKey('night-drive', 'normal');
    let p = recordBest(null, 'Alex', key, { score: 5000, accuracy: 80, grade: 'B', maxCombo: 20, at: 1 });
    p = { ...p, live: { song: 'Night Drive', score: 10, combo: 1, at: 1 } };
    const lower = recordBest(p, 'Alex', key, { score: 4000, accuracy: 70, grade: 'B', maxCombo: 9, at: 2 });
    expect(lower.best[key].score).toBe(5000);
    expect(lower.live).toBeNull();
    expect(recordBest(p, 'Alex', key, { score: 9000, accuracy: 95, grade: 'S', maxCombo: 60, at: 3 }).best[key].grade).toBe('S');
  });

  test('leaderboards, live players and matches are read defensively', () => {
    const key = bestKey('first-light', 'easy');
    const players = readPlayers({
      player_alex: { name: 'Alex', best: { [key]: { score: 300, grade: 'A' } }, live: { song: 'x', score: 120, at: 10_000 } },
      player_sam: { name: 'Sam', best: { [key]: { score: 900, grade: 'Z' }, 'x:insane': { score: 1 } } },
      player_bad: 7,
    });
    expect(leaderboard(players, key).map((r) => [r.name, r.grade])).toEqual([['Sam', 'D'], ['Alex', 'A']]);
    expect(Object.keys(players.player_sam.best)).toEqual([key]);
    expect(livePlayers(players, 12_000).map((r) => r.name)).toEqual(['Alex']);
    expect(livePlayers(players, 20_000)).toEqual([]);
    expect(cleanMatch({ song: 'overclock', difficulty: 'hard', startAt: 5, by: 'Sam' })).toEqual({ song: 'overclock', difficulty: 'hard', startAt: 5, by: 'Sam' });
    expect(cleanMatch({ song: 'overclock', difficulty: 'expert', startAt: 5 })).toBeNull();
    expect(playerField('Sam Lee')).toBe('player_sam-lee');
  });

  test('two players finishing at once both keep their scores', () => {
    const frame = { id: 'w1', kind: 'rhythmRun', x: 0, y: 0, w: 820, h: 580 };
    const a = new Y.Doc();
    const b = new Y.Doc();
    const sync = () => {
      Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
      Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
    };
    const base = { wins: [frame] };
    writeStateToDoc(a, null, base, 'local');
    sync();
    const key = bestKey('overclock', 'hard');
    writeStateToDoc(a, base, { wins: [{ ...frame, [playerField('Alex')]: recordBest(null, 'Alex', key, { score: 12000, grade: 'A' }) }] }, 'local');
    writeStateToDoc(b, base, { wins: [{ ...frame, [playerField('Sam')]: recordBest(null, 'Sam', key, { score: 15000, grade: 'S' }) }] }, 'local');
    sync();
    for (const doc of [a, b]) expect(leaderboard(readPlayers(readDocState(doc).wins[0]), key).map((r) => r.name)).toEqual(['Sam', 'Alex']);
  });

  test('Rhythm Run is in the Add palette under Games', () => {
    const games = buildAddSections({ manifests: WINDOW_MANIFESTS.filter((m) => m.moduleMenu?.show !== false) }).find((s) => s.label === 'Games');
    expect(games.items.map((i) => i.label)).toContain('Rhythm Run');
  });
});
