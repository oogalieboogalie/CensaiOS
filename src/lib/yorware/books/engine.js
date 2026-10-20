// Ported from Open Books (MIT, an open-source bookkeeping tool) into YorWare Books.
// The categorization chain: your rules, then built-in merchant knowledge,
// then a fallback. Amounts are integer cents, positive is money in.
import { getCategory } from './categories.js';
import { KEYWORD_RULES } from './keywords.js';
import { containsWords, normalizeDescription } from './normalize.js';

/** Below this confidence a transaction goes to the needs-review queue. */
export const REVIEW_THRESHOLD = 0.7;
export const MATCH_TYPES = Object.freeze(['contains', 'starts_with', 'exact']);
export const DIRECTIONS = Object.freeze(['any', 'in', 'out']);

const directionOf = (amountCents) => (amountCents >= 0 ? 'in' : 'out');

export function ruleMatches(rule, normalized, amountCents) {
  if (rule.direction !== 'any' && rule.direction !== directionOf(amountCents)) return false;
  const pattern = normalizeDescription(rule.pattern);
  if (!pattern) return false;
  switch (rule.matchType) {
    case 'exact':
      return normalized === pattern;
    case 'starts_with':
      return normalized === pattern || normalized.startsWith(`${pattern} `);
    default:
      return containsWords(normalized, pattern);
  }
}

export function userRuleClassifier(rules) {
  return {
    name: 'user-rules',
    classify(tx, normalized) {
      let best = null;
      for (const rule of rules) {
        if (!ruleMatches(rule, normalized, tx.amountCents)) continue;
        if (!best || rule.pattern.length > best.pattern.length) best = rule;
      }
      if (!best) return null;
      return { categoryId: best.categoryId, confidence: 0.99, source: 'rule', reason: `Your rule: "${best.pattern}"`, ruleId: best.id };
    },
  };
}

/** Any keyword beats a weak hint; then longer keyword wins; then direction-specific entries; then confidence. */
function isBetter(a, b) {
  if (a.weak !== b.weak) return !a.weak;
  if (a.keyword.length !== b.keyword.length) return a.keyword.length > b.keyword.length;
  if (a.directed !== b.directed) return a.directed;
  return a.confidence > b.confidence;
}

export const keywordClassifier = {
  name: 'keywords',
  classify(tx, normalized) {
    const dir = directionOf(tx.amountCents);
    let best = null;
    for (const entry of KEYWORD_RULES) {
      if (entry.direction && entry.direction !== dir) continue;
      for (const keyword of entry.keywords) {
        if (!containsWords(normalized, keyword)) continue;
        const candidate = { category: entry.category, confidence: entry.confidence, keyword, directed: !!entry.direction, weak: !!entry.weak };
        if (!best || isBetter(candidate, best)) best = candidate;
      }
    }
    if (!best) return null;
    const category = getCategory(best.category);
    const isRefund = dir === 'in' && (category.kind === 'expense' || category.kind === 'cogs');
    return {
      categoryId: best.category,
      confidence: isRefund ? Math.min(best.confidence, 0.75) : best.confidence,
      source: 'keyword',
      reason: isRefund ? `Refund or credit from "${best.keyword}"` : best.weak ? `Says "${best.keyword}"; check whether it moved money between your own accounts` : `Matched "${best.keyword}"`,
    };
  },
};

export const fallbackClassifier = {
  name: 'fallback',
  classify(tx) {
    if (tx.amountCents > 0) {
      return { categoryId: 'gross_receipts', confidence: 0.4, source: 'fallback', reason: 'Deposit from an unrecognized source; confirm it is business income' };
    }
    return { categoryId: 'uncategorized', confidence: 0, source: 'fallback', reason: 'No match' };
  },
};

export function categorize(tx, classifiers) {
  const normalized = normalizeDescription(tx.description);
  for (const classifier of classifiers) {
    const suggestion = classifier.classify(tx, normalized);
    if (suggestion) return suggestion;
  }
  return fallbackClassifier.classify(tx, normalized);
}

/** The standard chain: the user's rules, then built-in knowledge, then fallback. */
export function defaultClassifiers(rules) {
  return [userRuleClassifier(rules), keywordClassifier, fallbackClassifier];
}
