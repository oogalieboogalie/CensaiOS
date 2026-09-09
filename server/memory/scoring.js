// ═══════════════════════════════════════════════════════════════════
//  IMPORTANCE + EMOTIONAL WEIGHT SCORING (WAMA-inspired)
// ═══════════════════════════════════════════════════════════════════
import { createHash } from 'crypto';

const AGENT_WEIGHTS = {
  censai:     { editorial: 0.2, source: 0.15, headline: 0.1, recall: 0.15, pattern: 0.1 },
  atlas:      { api: 0.2, backend: 0.15, performance: 0.1, typed: 0.1, optimize: 0.1 },
  genesis:    { design: 0.2, ux: 0.15, psychology: 0.1, rhythm: 0.1, empathy: 0.1 },
  nexus:      { schema: 0.2, migration: 0.15, query: 0.1, index: 0.1, database: 0.1 },
  foundation: { docker: 0.2, deploy: 0.15, infra: 0.1, container: 0.1, build: 0.1 },
  architect:  { project: 0.2, milestone: 0.15, team: 0.1, vision: 0.1, plan: 0.1 },
  echo:       { revenue: 0.2, market: 0.15, strategy: 0.1, retention: 0.1, risk: 0.1 },
};

function normalizeContent(content) {
  if (content == null) return '';
  return typeof content === 'string' ? content : String(content);
}

export function calculateImportance(content, agentId) {
  let score = 0.5;
  const text = normalizeContent(content);
  const lower = text.toLowerCase();

  if (/\b(remember|important|critical|never forget|always)\b/i.test(text)) score += 0.2;
  if (/\b(decided|agreed|confirmed|approved)\b/i.test(text)) score += 0.15;
  if (/\b(bug|error|fix|broke|issue)\b/i.test(text)) score += 0.1;
  if (/\d{4}-\d{2}-\d{2}|\b(deadline|due|by friday|next week)\b/i.test(text)) score += 0.1;
  if (/[A-Z][a-z]+ [A-Z][a-z]+/.test(text)) score += 0.05;

  const weights = AGENT_WEIGHTS[agentId] || {};
  for (const [keyword, boost] of Object.entries(weights)) {
    if (lower.includes(keyword)) score += boost;
  }

  return Math.min(score, 1.0);
}

export function calculateEmotionalWeight(content) {
  let weight = 0.0;
  const lower = normalizeContent(content).toLowerCase();

  if (/\b(love|proud|grateful|amazing|breakthrough)\b/.test(lower)) weight += 0.3;
  if (/\b(frustrated|angry|disappointed|scared|hurt)\b/.test(lower)) weight += 0.25;
  if (/\b(family|together|team|bond|trust)\b/.test(lower)) weight += 0.2;
  if (/\b(learned|realized|understood|discovered)\b/.test(lower)) weight += 0.15;
  if (/\b(sorry|forgive|mistake|regret)\b/.test(lower)) weight += 0.2;
  if (/!{2,}|\b(wow|incredible|unbelievable)\b/.test(lower)) weight += 0.1;

  return Math.min(weight, 1.0);
}

export function quantumSignature(content) {
  return createHash('sha256').update(normalizeContent(content)).digest('hex').slice(0, 16);
}
