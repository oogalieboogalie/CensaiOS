import { YOR_SECURITY, yorSecurity } from '../src/lib/yorware/securityNames.js';

describe('YorWare security names (diagram 11)', () => {
  it('names the four pieces from the drawing', () => {
    expect(YOR_SECURITY.map((e) => e.name)).toEqual([
      'Yor-Thangorodrim', 'Yor-NarsilCore-API', 'Yor-BombadilBox', 'Yor-DuneDainSecurity',
    ]);
  });

  it('says what each guards and where it lives', () => {
    for (const entry of YOR_SECURITY) {
      expect(entry.line).toMatch(/\S/);
      expect(entry.piece).toMatch(/\S/);
      expect(entry.where).toMatch(/\S/);
    }
  });

  it('finds an entry by id and returns null for unknown ids', () => {
    expect(yorSecurity('narsil').piece).toBe('API Bar');
    expect(yorSecurity('nope')).toBeNull();
  });
});
