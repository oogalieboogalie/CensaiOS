// Sharp Bellman weighting for memory ranking (RIC v2).
// U(p, q) = sqrt(q^2 + p * ln(1/p)): quality q sets the floor, rarity p
// gives rare-but-critical memories a logarithmic lift instead of a vibe.
// q: normalized quality 0..1 (importance + emotional weight).
// p: rarity 0..1 — low activation/recall counts score high.
export function bellmanWeight(p, q) {
  const pp = Math.min(0.999, Math.max(0.001, Number(p)));
  const qq = Math.max(0, Number(q) || 0);
  if (pp <= 0 || pp >= 1) return qq;
  return Math.sqrt(qq * qq + pp * Math.log(1 / pp));
}

export function qualityOf(row) {
  const importance = Number(row.importance ?? row.importance_level ?? 5) || 0;
  const emotional = Number(row.emotional_weight ?? row.emotionalWeight ?? 5) || 0;
  return Math.min(1, Math.max(0.05, (importance / 10) * 0.7 + (emotional / 10) * 0.3));
}

export function rarityOf(row) {
  const activations = Number(row.activations ?? row.activation_count ?? row.recall_count ?? 1);
  return 1 / (1 + Math.max(0, activations || 0));
}

export function rankMemories(rows, limit = 12) {
  return (rows || [])
    .map((row) => ({ ...row, _score: bellmanWeight(rarityOf(row), qualityOf(row)) }))
    .sort((a, b) => b._score - a._score)
    .slice(0, Math.max(1, Math.min(limit, 50)));
}
