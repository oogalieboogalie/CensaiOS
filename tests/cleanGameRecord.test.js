import { cleanMatch, cleanScoreRows } from '../src/lib/games/cleanGameRecord.js';

describe('game records from the shared board', () => {
  test('high-score rows without a real score are dropped and names become words', () => {
    const rows = cleanScoreRows([
      null, 'not a row', { name: { nested: 1 }, score: 900 }, { name: ['a'], score: 'lots' },
      { name: 'No Score Example' }, { name: 'Sam Example', score: 700, at: 5 }, { name: 'x'.repeat(90), score: 3.5 },
    ]);
    expect(rows).toEqual([{ name: 'Player', score: 900, at: 0 }, { name: 'Sam Example', score: 700, at: 5 }]);
    expect(cleanScoreRows('nope')).toEqual([]);
  });

  test('a match needs a real host, and its host name is always words', () => {
    expect(cleanMatch('not a match')).toBeNull();
    expect(cleanMatch({ host: { nested: 1 } })).toBeNull();
    expect(cleanMatch({ host: 'pat-tab', hostName: ['a'], startedAt: 'soon' })).toEqual({ host: 'pat-tab', hostName: 'Someone', startedAt: 0 });
    expect(cleanMatch({ host: 'pat-tab', hostName: 'Pat Example', startedAt: 9 })).toEqual({ host: 'pat-tab', hostName: 'Pat Example', startedAt: 9 });
  });
});
