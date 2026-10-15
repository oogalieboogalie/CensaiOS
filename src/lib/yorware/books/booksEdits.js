// Changes to YorWare Books, each one a board patch (see booksModel.js).
// Edits rewrite only the records they touch.
import { getCategory, isCategoryId } from './categories.js';
import { DIRECTIONS, MATCH_TYPES, REVIEW_THRESHOLD, categorize, defaultClassifiers } from './engine.js';
import { normalizeDescription } from './normalize.js';
import { BUILTIN_METRICS, DERIVED_METRICS, EVENT_KINDS, metricKey as slugMetric } from './timeline.js';
import { customMetricKey, eventKey, metricKey, ruleKey, shortHash, txKey } from './booksModel.js';
import { newPartId } from '../../office/officeParts.js';
import { unlinkReceiptPatch } from './booksReceipts.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const raw = (win, k) => (win?.[k] && typeof win[k] === 'object' ? win[k] : null);

function editTx(win, id, change) {
  const t = raw(win, txKey(id));
  if (!t) throw new Error('That transaction is gone.');
  return { [txKey(id)]: { ...t, ...change } };
}

/**
 * Re-runs categorization on everything not set by hand. Answers from the AI
 * pass are kept unless one of your rules now matches. Returns a patch.
 */
export function recategorizePatch(win, books, rules = books.rules) {
  const classifiers = defaultClassifiers(rules);
  const patch = {};
  for (const tx of books.transactions) {
    if (tx.categorySource === 'user') continue;
    const s = categorize(tx, classifiers);
    if (tx.categorySource === 'ai' && s.source !== 'rule') continue;
    if (s.categoryId === tx.categoryId && (s.ruleId || null) === tx.ruleId && s.confidence === tx.confidence) continue;
    const t = raw(win, txKey(tx.id));
    if (!t) continue;
    patch[txKey(tx.id)] = { ...t, cat: s.categoryId, src: s.source, conf: s.confidence, reason: s.reason, rule: s.ruleId || null, review: s.confidence < REVIEW_THRESHOLD };
  }
  return patch;
}

/** A rule, plus re-sorting every transaction it now covers. Same pattern, match and direction is the same rule. */
export function createRulePatch(win, books, input) {
  if (!isCategoryId(input.categoryId)) throw new Error('Pick a category.');
  const pattern = normalizeDescription(input.pattern || '');
  if (!pattern) throw new Error('Enter the text to match.');
  const matchType = MATCH_TYPES.includes(input.matchType) ? input.matchType : 'contains';
  const direction = DIRECTIONS.includes(input.direction) ? input.direction : 'any';
  const id = `r${shortHash(`${pattern}|${matchType}|${direction}`)}`;
  const rule = { id, pattern, matchType, direction, categoryId: input.categoryId };
  const rules = [...books.rules.filter((r) => r.id !== id), rule];
  return {
    id,
    patch: { ...recategorizePatch(win, books, rules), [ruleKey(id)]: { pattern, matchType, direction, categoryId: input.categoryId, at: Date.now() } },
  };
}

export function deleteRulePatch(win, books, id) {
  const rules = books.rules.filter((r) => r.id !== id);
  return { ...recategorizePatch(win, books, rules), [ruleKey(id)]: null };
}

/**
 * Sets a category by hand. With `remember`, also makes a rule for this
 * merchant so future and existing matching transactions follow it.
 */
export function setCategoryPatch(win, books, id, categoryId, { remember = false } = {}) {
  if (!isCategoryId(categoryId)) throw new Error('Unknown category');
  const tx = books.transactions.find((t) => t.id === id);
  if (!tx) throw new Error('That transaction is gone.');
  const own = editTx(win, id, { cat: categoryId, src: 'user', conf: 1, reason: 'Set by you', rule: null, review: false });
  if (!remember || !tx.merchantKey || categoryId === 'uncategorized') return own;
  const kind = getCategory(categoryId).kind;
  // Income and expense rules only fire in the matching direction, so a refund
  // from a vendor is not mistaken for sales and vice versa.
  const direction = kind === 'income' ? 'in' : kind === 'non_pl' ? 'any' : tx.amountCents < 0 ? 'out' : 'any';
  const changed = { ...books, transactions: books.transactions.map((t) => (t.id === id ? { ...t, categorySource: 'user' } : t)) };
  const { patch } = createRulePatch({ ...win, ...own }, changed, { pattern: tx.merchantKey, categoryId, direction });
  return { ...patch, ...own };
}

export const markReviewedPatch = (win, id) => editTx(win, id, { review: false });
export const notesPatch = (win, id, notes) => editTx(win, id, { notes: String(notes || '').trim() });
/** Deletes a transaction; a receipt linked to it goes back to waiting for its charge. */
export function deleteTxPatch(id, books = null) {
  const patch = { [txKey(id)]: null };
  for (const r of books?.receipts || []) if (r.transactionId === id) Object.assign(patch, unlinkReceiptPatch(r));
  return patch;
}

/**
 * AI answers for unsure transactions; skips rows a person or a rule touched
 * meanwhile. The model's reply is only a suggestion: it can only answer for
 * the rows it was asked about, and it only clears the review queue when the
 * category fits the direction of the money (income for money in, a cost for
 * money out). Transfers, owner draws and loans always wait for a person.
 */
export function aiAnswersPatch(win, books, answers, clearAt = 0.85, askedIds = null) {
  const patch = {};
  let cleared = 0;
  const asked = askedIds ? new Set(askedIds) : null;
  for (const a of answers) {
    if (asked && !asked.has(a?.id)) continue;
    const tx = books.transactions.find((t) => t.id === a.id);
    if (!tx || !['fallback', 'keyword'].includes(tx.categorySource)) continue;
    if (!isCategoryId(a.category_id) || a.category_id === 'uncategorized') continue;
    const confidence = Math.max(0, Math.min(0.95, Number(a.confidence) || 0));
    const kind = getCategory(a.category_id).kind;
    const fits = tx.amountCents > 0 ? kind === 'income' : ['expense', 'cogs', 'other_deduction'].includes(kind);
    const review = confidence < clearAt || !fits;
    if (!review) cleared += 1;
    const reason = `AI: ${String(a.reason || getCategory(a.category_id).name).slice(0, 200)}`;
    Object.assign(patch, editTx(win, tx.id, { cat: a.category_id, src: 'ai', conf: confidence, reason, rule: null, review }));
  }
  return { patch, updated: Object.keys(patch).length, cleared };
}

// Timeline: events and daily numbers

export function addEventPatch(input) {
  if (!ISO.test(input.date)) throw new Error('Enter a date.');
  if (!input.title?.trim()) throw new Error('Give the event a short title.');
  const url = (input.url || '').trim();
  if (url && !/^https?:\/\//i.test(url)) throw new Error('Links should start with http:// or https://');
  const kind = EVENT_KINDS.some((k) => k.key === input.kind) ? input.kind : 'other';
  return { [eventKey(newPartId('e'))]: { date: input.date, kind, title: input.title.trim(), url, notes: (input.notes || '').trim(), at: Date.now() } };
}
export const deleteEventPatch = (id) => ({ [eventKey(id)]: null });

/** The numbers people log by hand, built-in and their own. */
export function metricDefs(books) {
  return [
    ...BUILTIN_METRICS.map((m) => ({ ...m })),
    ...books.customMetrics.sort((a, b) => a.name.localeCompare(b.name)),
    ...DERIVED_METRICS.map((m) => ({ ...m, derived: true })),
  ];
}

/** Logging the same number on the same day again replaces it. A new name makes a custom number. */
export function logMetricPatch(books, input) {
  if (!ISO.test(input.date)) throw new Error('Enter a date.');
  const value = Number(input.value);
  if (!Number.isFinite(value) || value < 0) throw new Error('Enter a number of zero or more.');
  const defs = metricDefs(books);
  let k = input.metric;
  let def = defs.find((m) => m.key === k);
  const patch = {};
  if (!def) {
    k = slugMetric(String(input.metric || ''));
    if (!k) throw new Error('Name the number.');
    def = defs.find((m) => m.key === k);
    if (!def) patch[customMetricKey(k)] = { name: String(input.metric).trim() };
  }
  if (def?.derived) throw new Error(`${def.name} is counted automatically.`);
  patch[metricKey(input.date, k)] = value;
  return patch;
}
