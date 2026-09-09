import { bellmanWeight, qualityOf, rarityOf, rankMemories } from '../server/memory/duckbrain/bellman.js';

describe('bellman memory ranking', () => {
  test('rare-but-critical outranks common-but-mild', () => {
    const rare = { importance: 10, emotional_weight: 10, activations: 0 };
    const common = { importance: 4, emotional_weight: 4, activations: 50 };
    expect(bellmanWeight(rarityOf(rare), qualityOf(rare)))
      .toBeGreaterThan(bellmanWeight(rarityOf(common), qualityOf(common)));
  });

  test('quality sets the floor at equal rarity', () => {
    expect(bellmanWeight(0.5, 0.9)).toBeGreaterThan(bellmanWeight(0.5, 0.1));
  });

  test('rankMemories sorts desc and caps', () => {
    const rows = [
      { title: 'mild', importance: 2, activations: 3 },
      { title: 'critical', importance: 10, emotional_weight: 10, activations: 0 },
      { title: 'mid', importance: 6, activations: 5 },
    ];
    const ranked = rankMemories(rows, 2);
    expect(ranked.map((r) => r.title)).toEqual(['critical', 'mid']);
    expect(ranked[0]._score).toBeGreaterThan(0);
  });

  test('missing fields degrade to safe defaults', () => {
    expect(qualityOf({})).toBeGreaterThan(0);
    expect(rarityOf({})).toBeLessThanOrEqual(1);
    expect(rankMemories(null)).toEqual([]);
  });
});
