import { readBestLaps } from '../src/lib/games/racetrack/bestLapRows.js';

describe('readBestLaps (the shared best-lap table)', () => {
  it('drops rows a teammate planted that a person could not have set', () => {
    const rows = readBestLaps([
      null,
      'not a row',
      ['a', 'list'],
      { name: { nested: 'object' }, ms: 30000 },
      { name: ['a', 'list'], ms: 'fast' },
      { name: 'Pat Example', ms: Infinity },
      { name: 'Pat Example', ms: -5 },
      { name: 'Sam Example', ms: 45000, at: 1 },
    ]);
    expect(rows).toEqual([
      { name: 'Driver', ms: 30000, at: 0 },
      { name: 'Sam Example', ms: 45000, at: 1 },
    ]);
  });

  it('keeps names as words, cut short, fastest first, one row per name', () => {
    const long = `Made-up ${'x'.repeat(80)}`;
    const rows = readBestLaps([
      { name: 'Sam Example', ms: 50000 },
      { name: 'Sam Example', ms: 42000 },
      { name: long, ms: 41000 },
      { name: '<b>Pat Example</b>', ms: 43000 },
    ]);
    expect(rows.map((r) => r.ms)).toEqual([41000, 42000, 43000]);
    expect(rows[0].name).toHaveLength(40);
    expect(rows[2].name).toBe('<b>Pat Example</b>');
  });

  it('answers an empty table for anything that is not a list', () => {
    expect(readBestLaps(undefined)).toEqual([]);
    expect(readBestLaps({ name: 'Sam Example', ms: 1 })).toEqual([]);
    expect(readBestLaps('rows')).toEqual([]);
  });

  it('keeps at most five rows', () => {
    const rows = readBestLaps(Array.from({ length: 9 }, (_, i) => ({ name: `Driver ${i}`, ms: 40000 + i })));
    expect(rows).toHaveLength(5);
  });
});
