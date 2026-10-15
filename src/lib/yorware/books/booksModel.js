// How a YorWare Books window keeps its books in board state. Each record is
// its own window field, so two people keeping the books at once (one
// importing a bank file, one fixing categories) merge instead of overwriting
// each other. A removed record is set to null (undefined is skipped by the
// sync).
//
//   ba.<id>             account     { name, type, at }
//   bt.<id>             transaction { date, desc, mk, amt, acct, cat, src, conf, reason, rule, review, notes, at }
//   br.<id>             rule        { pattern, matchType, direction, categoryId, at }
//   be.<id>             event       { date, kind, title, url, notes, at }
//   bm.<date>.<metric>  daily number (a plain number)
//   bc.<metric>         custom number name { name }
//   bk.<id> / bf.<id>   receipt / its photo or PDF (kept apart so fixing a
//                       receipt's amount never re-sends the file)
//
// Imported rows get an id made from the account, date, amount and
// description, so the same bank file imported twice, or by two people at
// the same moment, lands on the same fields instead of doubling up.
import { newPartId, readParts } from '../../office/officeParts.js';
import { isCategoryId } from './categories.js';
import { REVIEW_THRESHOLD, categorize, defaultClassifiers } from './engine.js';
import { merchantKey } from './normalize.js';

export const BOOKS_PART = Object.freeze({
  account: 'ba', tx: 'bt', rule: 'br', event: 'be', metric: 'bm', customMetric: 'bc', receipt: 'bk', file: 'bf',
});
export const ACCOUNT_TYPES = Object.freeze(['checking', 'savings', 'credit_card', 'cash', 'other']);
// Every record lives on the board, which every teammate downloads.
export const MAX_TRANSACTIONS = 6000;
export const MAX_RECEIPT_FILES = 60;
export const MAIN_ACCOUNT = 'main';
// The sample books live in their own account so they never mix with real ones.
export const SAMPLE_ACCOUNT = 'sample';
export const SAMPLE_FIELD = 'bkSample';

const key = (kind, id) => `${BOOKS_PART[kind]}.${id}`;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** What a new Books window starts with: one checking account. */
export function makeBooks() {
  return { [key('account', MAIN_ACCOUNT)]: { name: 'Business checking', type: 'checking', at: 0 } };
}

/** A short stable hash (cyrb53) as base 36, for import ids. */
export function shortHash(text) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const toTx = (id, t, accounts) => ({
  id,
  date: t.date,
  description: t.desc || '',
  merchantKey: t.mk || '',
  amountCents: Number(t.amt) || 0,
  accountId: t.acct || null,
  accountName: accounts[t.acct]?.name || null,
  categoryId: isCategoryId(t.cat) ? t.cat : 'uncategorized',
  categorySource: t.src || 'fallback',
  confidence: Number(t.conf) || 0,
  reason: t.reason || '',
  ruleId: t.rule || null,
  needsReview: Boolean(t.review),
  notes: t.notes || '',
  at: t.at || 0,
});

/** Everything in one Books window, read from its fields. Transactions are newest first. */
export function readBooks(win) {
  const rawAccounts = readParts(win, BOOKS_PART.account);
  const accounts = Object.entries(rawAccounts)
    .map(([id, a]) => ({ id, name: a.name || 'Account', type: ACCOUNT_TYPES.includes(a.type) ? a.type : 'other', at: a.at || 0 }))
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  const byAccount = Object.fromEntries(accounts.map((a) => [a.id, a]));
  const transactions = Object.entries(readParts(win, BOOKS_PART.tx))
    .filter(([, t]) => t && ISO.test(t.date))
    .map(([id, t]) => toTx(id, t, byAccount))
    .sort((a, b) => (a.date === b.date ? b.at - a.at || (a.id < b.id ? 1 : -1) : a.date < b.date ? 1 : -1));
  const rules = Object.entries(readParts(win, BOOKS_PART.rule))
    .map(([id, r]) => ({ id, pattern: r.pattern || '', matchType: r.matchType || 'contains', direction: r.direction || 'any', categoryId: r.categoryId }))
    .filter((r) => r.pattern && isCategoryId(r.categoryId))
    .sort((a, b) => a.pattern.localeCompare(b.pattern));
  const events = Object.entries(readParts(win, BOOKS_PART.event))
    .filter(([, e]) => ISO.test(e.date))
    .map(([id, e]) => ({ id, date: e.date, kind: e.kind || 'other', title: e.title || '', url: e.url || '', notes: e.notes || '', sample: Boolean(e.sample), at: e.at || 0 }))
    .sort((a, b) => (a.date === b.date ? a.at - b.at : a.date < b.date ? -1 : 1));
  const metrics = Object.entries(readParts(win, BOOKS_PART.metric))
    .map(([k, value]) => { const [date, metric] = k.split('.'); return { date, key: metric, value: Number(value) || 0 }; })
    .filter((m) => ISO.test(m.date) && m.key);
  const customMetrics = Object.entries(readParts(win, BOOKS_PART.customMetric)).map(([k, m]) => ({ key: k, name: m.name || k }));
  const files = readParts(win, BOOKS_PART.file);
  const receipts = Object.entries(readParts(win, BOOKS_PART.receipt))
    .map(([id, r]) => ({
      id, vendor: r.vendor || '', date: ISO.test(r.date) ? r.date : null, amountCents: Number.isFinite(r.amt) ? r.amt : null,
      orderRef: r.orderRef || '', status: r.status || 'unmatched', transactionId: r.tx || null, matchKind: r.matchKind || '',
      source: r.source || 'upload', note: r.note || '', at: r.at || 0, file: files[id] || null,
    }))
    .sort((a, b) => b.at - a.at);
  const hasSample = Boolean(win[SAMPLE_FIELD]) || Boolean(rawAccounts[SAMPLE_ACCOUNT]);
  return { accounts, transactions, rules, events, metrics, customMetrics, receipts, hasSample };
}

function txRecord(input, suggestion, at) {
  return {
    date: input.date, desc: input.description.trim(), mk: merchantKey(input.description), amt: input.amountCents,
    acct: input.accountId || MAIN_ACCOUNT, cat: suggestion.categoryId, src: suggestion.source, conf: suggestion.confidence,
    reason: suggestion.reason, rule: suggestion.ruleId || null, review: suggestion.confidence < REVIEW_THRESHOLD,
    notes: (input.notes || '').trim(), at,
  };
}

/** A transaction typed in by hand. Returns { id, patch }. */
export function addTransactionPatch(books, input) {
  if (!ISO.test(input.date)) throw new Error('Enter a date.');
  if (!input.description?.trim()) throw new Error('Enter a description.');
  if (!Number.isFinite(input.amountCents) || input.amountCents === 0) throw new Error('Enter an amount.');
  if (books.transactions.length >= MAX_TRANSACTIONS) throw new Error(`These books are full (${MAX_TRANSACTIONS} transactions). Start another Books window for the next year.`);
  const manual = input.categoryId && input.categoryId !== 'uncategorized' && isCategoryId(input.categoryId);
  const s = manual
    ? { categoryId: input.categoryId, source: 'user', confidence: 1, reason: 'Set by you' }
    : categorize(input, defaultClassifiers(books.rules));
  const id = input.id || newPartId('t');
  return { id, patch: { [key('tx', id)]: txRecord(input, s, Date.now()) } };
}

/**
 * Bank or card rows from a CSV. Rows already in the books are skipped, even
 * legitimately repeated ones such as two identical coffees on the same day.
 */
export function importRowsPatch(books, accountId, rows) {
  const have = new Set(books.transactions.map((t) => t.id));
  const classifiers = defaultClassifiers(books.rules);
  const seen = new Map();
  const patch = {};
  const ids = [];
  let duplicates = 0;
  let needsReview = 0;
  let full = 0;
  const now = Date.now();
  for (const row of rows) {
    // The bank's own wording, so two orders or two stores on one day stay two rows.
    const base = `${accountId}|${row.date}|${row.amountCents}|${String(row.description).toUpperCase().replace(/\s+/g, ' ').trim()}`;
    const occurrence = (seen.get(base) || 0) + 1;
    seen.set(base, occurrence);
    const id = `i${shortHash(`${base}|${occurrence}`)}`;
    if (have.has(id) || patch[key('tx', id)]) { duplicates += 1; continue; }
    if (have.size + ids.length >= MAX_TRANSACTIONS) { full += 1; continue; }
    const s = categorize(row, classifiers);
    patch[key('tx', id)] = txRecord({ ...row, accountId }, s, now);
    ids.push(id);
    if (s.confidence < REVIEW_THRESHOLD) needsReview += 1;
  }
  return { patch, ids, imported: ids.length, duplicates, needsReview, full };
}

export function addAccountPatch(name, type) {
  if (!name?.trim()) throw new Error('Name the account.');
  if (!ACCOUNT_TYPES.includes(type)) throw new Error('Unknown account type');
  return { [key('account', newPartId('a'))]: { name: name.trim(), type, at: Date.now() } };
}

export const txKey = (id) => key('tx', id);
export const ruleKey = (id) => key('rule', id);
export const eventKey = (id) => key('event', id);
export const metricKey = (date, metric) => `${BOOKS_PART.metric}.${date}.${metric}`;
export const customMetricKey = (metric) => key('customMetric', metric);
export const receiptKey = (id) => key('receipt', id);
export const fileKey = (id) => key('file', id);
