// AGENT NETWORK — pure discovery ranking.
// Scores AgentCards against a natural-language need ("who can write a
// postgres migration?") using only what each card advertises: its skills
// (name, id, description, tags), its name and description, and
// metadata.tags. No model call, so discovery is cheap, deterministic and
// works for agents on any provider (BYOK) or none at all.

const STOPWORDS = new Set([
  'a', 'an', 'and', 'any', 'are', 'can', 'do', 'for', 'from', 'help', 'i', 'in', 'is', 'it',
  'me', 'my', 'need', 'of', 'on', 'or', 'please', 'some', 'someone', 'that', 'the', 'this',
  'to', 'us', 'we', 'who', 'with', 'you', 'agent', 'agents',
]);

const WEIGHTS = Object.freeze({
  skillName: 5, skillTag: 4, cardTag: 3, cardName: 3, skillDescription: 2, cardDescription: 1.5,
});

export function stem(word) {
  const w = String(word || '').toLowerCase();
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && w.endsWith('es') && /(s|x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

export function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !STOPWORDS.has(word))
    .map(stem);
}

function tokenSet(...parts) {
  return new Set(parts.flatMap((part) => (Array.isArray(part) ? part.flatMap(tokenize) : tokenize(part))));
}

function normalizedTags(values) {
  return (Array.isArray(values) ? values : [])
    .map((tag) => String(tag || '').trim().toLowerCase())
    .filter(Boolean);
}

export function cardSkills(card) {
  return (Array.isArray(card?.skills) ? card.skills : [])
    .filter((skill) => skill && typeof skill === 'object')
    .map((skill) => ({
      id: String(skill.id || skill.name || '').trim(),
      name: String(skill.name || skill.id || '').trim(),
      description: String(skill.description || '').trim(),
      tags: normalizedTags(skill.tags),
    }))
    .filter((skill) => skill.id || skill.name);
}

export function cardTags(card) {
  const tags = new Set(normalizedTags(card?.metadata?.tags));
  for (const skill of cardSkills(card)) for (const tag of skill.tags) tags.add(tag);
  return [...tags];
}

function hits(queryTokens, fieldTokens) {
  let count = 0;
  for (const token of queryTokens) if (fieldTokens.has(token)) count += 1;
  return count;
}

/**
 * Score one card. Returns { score, matchedSkills, reasons } where
 * matchedSkills are the advertised skills that matched the need.
 */
export function scoreCard(card, queryTokens) {
  const tokens = [...new Set(queryTokens)];
  const reasons = [];
  let score = 0;
  const matchedSkills = [];
  for (const skill of cardSkills(card)) {
    const skillScore = WEIGHTS.skillName * hits(tokens, tokenSet(skill.name, skill.id))
      + WEIGHTS.skillTag * hits(tokens, tokenSet(skill.tags))
      + WEIGHTS.skillDescription * hits(tokens, tokenSet(skill.description));
    if (skillScore > 0) {
      matchedSkills.push({ ...skill, score: skillScore });
      score += skillScore;
    }
  }
  matchedSkills.sort((a, b) => b.score - a.score);
  if (matchedSkills.length) reasons.push(`skills: ${matchedSkills.map((s) => s.name).join(', ')}`);
  const nameHits = hits(tokens, tokenSet(card?.name));
  if (nameHits) { score += WEIGHTS.cardName * nameHits; reasons.push('name'); }
  const tagHits = hits(tokens, tokenSet(normalizedTags(card?.metadata?.tags)));
  if (tagHits) { score += WEIGHTS.cardTag * tagHits; reasons.push('tags'); }
  const descriptionHits = hits(tokens, tokenSet(card?.description));
  if (descriptionHits) { score += WEIGHTS.cardDescription * descriptionHits; reasons.push('description'); }
  return { score, matchedSkills, reasons };
}

/**
 * Rank cards for a need. With no query every card is returned (pinned
 * first, then by name); with a query only cards that matched are kept.
 * `tags` is an AND filter over skill tags + metadata.tags.
 */
export function rankAgentCards(cards, { query = '', tags = [], limit = 10, isPreferred = () => false } = {}) {
  const queryTokens = tokenize(query);
  const requiredTags = normalizedTags(tags);
  const max = Math.max(1, Math.min(Number(limit) || 10, 50));
  const ranked = [];
  for (const card of Array.isArray(cards) ? cards : []) {
    if (requiredTags.length) {
      const have = new Set(cardTags(card));
      if (!requiredTags.every((tag) => have.has(tag))) continue;
    }
    const { score, matchedSkills, reasons } = scoreCard(card, queryTokens);
    if (queryTokens.length && score <= 0) continue;
    ranked.push({ card, score, matchedSkills, reasons, preferred: Boolean(isPreferred(card)) });
  }
  ranked.sort((a, b) => (b.score - a.score)
    || (Number(b.preferred) - Number(a.preferred))
    || String(a.card?.name || '').localeCompare(String(b.card?.name || '')));
  return ranked.slice(0, max);
}
