// recommend-lib.mjs — pure helpers for the librarian recommender slice.
//
// Slice 2 of .team/ideas/2026-06-06-librarian-intake-routing.md. Pure functions only;
// no I/O, no fetch, no fs. The CLI (intake-recommend.mjs) wires these to scanIdeasDirectory
// output. Keeping this dependency-free makes the suggestion logic trivially testable
// and means the deterministic path works with zero network access.

export const CANONICAL_PHASES = ['-1', '0', '1', '1.5', '2', '3', '4', 'cross-cutting'];

export const CANONICAL_DISPOSITIONS = [
  'placed',
  'parked',
  'absorbed',
  'killed',
  'needs-contract',
];

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'have',
  'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'to', 'with', 'this',
  'these', 'those', 'we', 'our', 'into', 'via', 'over', 'under', 'but', 'not',
]);

// Phase hints keyed on tag presence. Order matters — first match wins.
const PHASE_TAG_HINTS = [
  { tags: ['marketplace', 'factory', 'a2a'], phase: '3' },
  { tags: ['cloud', 'ops', 'api'], phase: '2' },
  { tags: ['ops', 'agents'], phase: '1' },
  { tags: ['canvas', 'modules'], phase: '2' },
  { tags: ['canvas', 'agents'], phase: '1' },
  { tags: ['agents', 'modules'], phase: 'cross-cutting' },
];

// Phase hints from title keywords. Matched before tag hints so explicit phase
// numbers in the title always win over a fuzzy tag guess.
const PHASE_TITLE_HINTS = [
  { pattern: /rung[\s-]?1(\.5)?|phase[\s-]?1\.5/i, phase: '1.5' },
  { pattern: /\bphase[\s-]?4\b|stage[\s-]?4/i, phase: '4' },
  { pattern: /\bphase[\s-]?3\b|stage[\s-]?3/i, phase: '3' },
  { pattern: /\bphase[\s-]?2\b|stage[\s-]?2/i, phase: '2' },
  { pattern: /\bphase[\s-]?1\b|stage[\s-]?1/i, phase: '1' },
  { pattern: /\bphase[\s-]?0\b|foundation|founding/i, phase: '0' },
  { pattern: /cross[\s-]?cutting|groundwork/i, phase: 'cross-cutting' },
];

export function tokenize(text) {
  if (typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

export function jaccard(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) if (setB.has(item)) intersection += 1;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function phaseFromTitle(title) {
  if (typeof title !== 'string') return null;
  for (const hint of PHASE_TITLE_HINTS) {
    if (hint.pattern.test(title)) return hint.phase;
  }
  return null;
}

export function phaseFromTags(tags) {
  if (!Array.isArray(tags)) return null;
  const tagSet = new Set(tags);
  for (const hint of PHASE_TAG_HINTS) {
    if (hint.tags.every((tag) => tagSet.has(tag))) return hint.phase;
  }
  if (tagSet.has('cross-cutting')) return 'cross-cutting';
  return null;
}

// Disposition classifier. Order matters — first match wins.
// Each candidate has: file path, kind (raw | invalid | valid), optional title/body hints.
export function dispositionFromCandidate(candidate) {
  const path = candidate.path || '';
  const title = (candidate.title || '').toLowerCase();

  if (candidate.kind === 'invalid') {
    return { disposition: 'needs-contract', reason: 'frontmatter invalid or missing fields' };
  }
  if (candidate.kind === 'raw') {
    return { disposition: 'needs-contract', reason: 'markdown file without idea-card frontmatter' };
  }
  if (title.includes('scratch') || title.includes('random thoughts') || path.includes('scratch')) {
    return { disposition: 'parked', reason: 'looks like a scratch-pad or brainstorm dump' };
  }
  if (title.includes('bug') || title.includes('stability')) {
    return { disposition: 'absorbed', reason: 'operational bug sweep, likely absorbed by maintenance work' };
  }
  return { disposition: 'needs-contract', reason: 'valid card with non-canonical status — needs a routing decision' };
}

export function findCompanions(target, others, suggestedPhase, max = 5) {
  const targetTokens = tokenize(`${target.title || ''} ${(target.tags || []).join(' ')}`);
  const targetTags = new Set(target.tags || []);
  const scored = [];
  for (const other of others) {
    if (!other || other.path === target.path) continue;
    let score = 0;
    if (suggestedPhase && other.phase === suggestedPhase) score += 2;
    const otherTags = new Set(other.tags || []);
    let sharedTags = 0;
    for (const tag of targetTags) if (otherTags.has(tag)) sharedTags += 1;
    if (sharedTags >= 2) score += sharedTags;
    const otherTokens = tokenize(`${other.title || ''} ${(other.tags || []).join(' ')}`);
    const overlap = jaccard(targetTokens, otherTokens);
    if (overlap >= 0.2) score += Math.round(overlap * 5);
    if (score > 0) scored.push({ path: other.path, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, max).map((entry) => entry.path);
}

export function buildRationale(candidate, phase, disposition, companionCount) {
  const subject = candidate.title ? `"${candidate.title}"` : candidate.path;
  const where = phase ? ` to phase ${phase}` : '';
  const why = disposition === 'needs-contract'
    ? 'needs a routing decision before it can land in the intake'
    : `looks like a fit${where}`;
  const companionsNote = companionCount > 0
    ? `; ${companionCount} companion idea${companionCount === 1 ? '' : 's'} surfaced`
    : '';
  return `${subject} ${why}${companionsNote}.`;
}

export function suggestRecommendation(candidate, others) {
  const phase = phaseFromTitle(candidate.title) || phaseFromTags(candidate.tags) || '2';
  const { disposition, reason } = dispositionFromCandidate(candidate);
  const companions = findCompanions(candidate, others, phase);
  const rationale = buildRationale(candidate, phase, disposition, companions.length);
  return {
    file: candidate.path,
    suggestedPhase: phase,
    suggestedDisposition: disposition,
    companions,
    rationale,
    _reason: reason,
  };
}

// Apply a model-provided map { [file]: { rationale?, companions? } } on top of
// deterministic recommendations. Only overrides fields the model actually
// supplies; everything else stays deterministic.
export function mergeModelOutput(recommendations, modelMap) {
  if (!modelMap || typeof modelMap !== 'object') return recommendations;
  return recommendations.map((rec) => {
    const overlay = modelMap[rec.file];
    if (!overlay || typeof overlay !== 'object') return rec;
    const next = { ...rec };
    if (typeof overlay.rationale === 'string' && overlay.rationale.trim()) {
      next.rationale = overlay.rationale.trim();
    }
    if (Array.isArray(overlay.companions)) {
      next.companions = overlay.companions.filter((p) => typeof p === 'string').slice(0, 5);
    }
    return next;
  });
}
