// Read-only views of YorWare Books: totals, the review queue, filtered
// transaction lists, and the timeline. Ported from Open Books (MIT), where
// these were SQL queries; here they run over the board records.
import { getCategory } from './categories.js';
import { bucketIndex, buildBuckets } from './timeline.js';
import { metricDefs } from './booksEdits.js';

export function booksYears(books) {
  return [...new Set(books.transactions.map((t) => Number(t.date.slice(0, 4))))].sort((a, b) => b - a);
}

export function pickYear(year, years) {
  const n = Number(year);
  if (Number.isInteger(n) && n > 1900 && n < 3000) return n;
  return years[0] ?? new Date().getFullYear();
}

/** Signed totals per category for a year, as a Map. */
export function categoryTotals(books, year) {
  const totals = new Map();
  const y = String(year);
  for (const t of books.transactions) {
    if (!t.date.startsWith(y)) continue;
    totals.set(t.categoryId, (totals.get(t.categoryId) || 0) + t.amountCents);
  }
  return totals;
}

export const reviewCount = (books) => books.transactions.filter((t) => t.needsReview).length;

/** Transactions in a year that are still the categorizer's guess. */
export function unreviewedTotals(books, year) {
  const y = String(year);
  const out = { count: 0, inCents: 0, outCents: 0 };
  for (const t of books.transactions) {
    if (!t.needsReview || !t.date.startsWith(y)) continue;
    out.count += 1;
    if (t.amountCents > 0) out.inCents += t.amountCents;
    else out.outCents -= t.amountCents;
  }
  return out;
}

/** Transactions matching a filter, newest first. */
export function filterTransactions(books, f = {}) {
  const q = (f.search || '').trim().toLowerCase();
  return books.transactions.filter((t) => {
    if (f.year && !t.date.startsWith(String(f.year))) return false;
    if (f.from && t.date < f.from) return false;
    if (f.to && t.date > f.to) return false;
    if (f.categoryId && t.categoryId !== f.categoryId) return false;
    if (f.needsReview && !t.needsReview) return false;
    if (f.accountId && t.accountId !== f.accountId) return false;
    if (q && !t.description.toLowerCase().includes(q) && !t.notes.toLowerCase().includes(q)) return false;
    return true;
  });
}

const kindOf = (id) => getCategory(id).kind;

export function earliestDate(books) {
  const dates = [
    ...books.transactions.map((t) => t.date),
    ...books.events.map((e) => e.date),
    ...books.metrics.map((m) => m.date),
  ];
  return dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null;
}

/** Income and expenses per bucket, plus every tracked number and event, on one axis. */
export function timelineData(books, from, to, granularity) {
  const buckets = buildBuckets(from, to, granularity).map((b) => ({ ...b, incomeCents: 0, expenseCents: 0 }));
  const seriesMap = new Map();
  const add = (k, date, value) => {
    const i = bucketIndex(buckets, date);
    if (i === -1) return;
    if (!seriesMap.has(k)) seriesMap.set(k, buckets.map(() => 0));
    seriesMap.get(k)[i] += value;
  };
  for (const t of books.transactions) {
    const i = bucketIndex(buckets, t.date);
    if (i === -1) continue;
    const kind = kindOf(t.categoryId);
    if (kind === 'income') buckets[i].incomeCents += t.amountCents;
    else if (kind === 'expense' || kind === 'cogs') buckets[i].expenseCents -= t.amountCents;
    if (t.categoryId === 'gross_receipts' && t.amountCents > 0) add('sales_count', t.date, 1);
  }
  for (const m of books.metrics) add(m.key, m.date, m.value);
  const series = metricDefs(books)
    .filter((d) => seriesMap.get(d.key)?.some((v) => v !== 0))
    .map((d) => ({ key: d.key, name: d.name, values: seriesMap.get(d.key) }));
  return {
    from: buckets[0]?.start ?? from,
    to: buckets[buckets.length - 1]?.end ?? to,
    granularity,
    buckets,
    series,
    events: books.events.map((e) => ({ ...e, bucket: bucketIndex(buckets, e.date) })).filter((e) => e.bucket >= 0),
  };
}

/** Everything behind one column of the timeline. */
export function periodDetail(books, from, to) {
  const transactions = filterTransactions(books, { from, to });
  let incomeCents = 0;
  let expenseCents = 0;
  for (const t of transactions) {
    const kind = kindOf(t.categoryId);
    if (kind === 'income') incomeCents += t.amountCents;
    else if (kind === 'expense' || kind === 'cogs') expenseCents -= t.amountCents;
  }
  const defs = metricDefs(books);
  const metrics = books.metrics
    .filter((m) => m.date >= from && m.date <= to)
    .sort((a, b) => (a.date === b.date ? a.key.localeCompare(b.key) : a.date < b.date ? -1 : 1))
    .map((m) => ({ ...m, name: defs.find((d) => d.key === m.key)?.name ?? m.key }));
  const receiptFor = new Map(books.receipts.filter((r) => r.transactionId).map((r) => [r.transactionId, r.id]));
  return {
    from,
    to,
    incomeCents,
    expenseCents,
    transactions: transactions.slice(0, 200).map((t) => ({ ...t, receiptId: receiptFor.get(t.id) || null })),
    transactionCount: transactions.length,
    events: books.events.filter((e) => e.date >= from && e.date <= to),
    metrics,
  };
}

/** Metrics grouped for the period panel: total plus each day. */
export function groupMetrics(metrics) {
  const groups = new Map();
  for (const m of metrics) {
    const g = groups.get(m.key) ?? { key: m.key, name: m.name, total: 0, days: [] };
    g.total += m.value;
    g.days.push({ date: m.date, value: m.value });
    groups.set(m.key, g);
  }
  return [...groups.values()];
}
