// Receipts in YorWare Books: a photo or PDF with who was paid, how much and
// when, matched to the bank or card charge it belongs to. A receipt saved
// before its charge is imported waits, then matches when the charge arrives.
// Ported from Open Books (MIT).
import { newPartId } from '../../office/officeParts.js';
import { merchantKey } from './normalize.js';
import { addDays, daysBetween } from './timeline.js';
import { MAX_RECEIPT_FILES, SAMPLE_ACCOUNT, addTransactionPatch, fileKey, receiptKey } from './booksModel.js';

const MATCH_BEFORE = 3;
const MATCH_AFTER = 10;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const record = (r) => ({
  vendor: r.vendor, date: r.date, amt: r.amountCents, orderRef: r.orderRef || '', status: r.status, tx: r.transactionId || null,
  matchKind: r.matchKind || '', source: r.source || 'upload', note: r.note || '', at: r.at || Date.now(),
});

/** A new receipt. `file` is { name, type, src } (a data URL) or null. */
export function addReceiptPatch(books, input, file = null) {
  if (file && books.receipts.filter((r) => r.file).length >= MAX_RECEIPT_FILES) {
    throw new Error(`These books hold ${MAX_RECEIPT_FILES} receipt files. Delete old ones, or save this one without the file.`);
  }
  if (!input.vendor?.trim() && !file) throw new Error('Add a photo or PDF, or say who was paid.');
  const id = newPartId('k');
  const r = {
    id, vendor: (input.vendor || '').trim(), date: ISO.test(input.date) ? input.date : null,
    amountCents: Number.isFinite(input.amountCents) ? Math.abs(input.amountCents) : null, orderRef: input.orderRef || '',
    status: 'unmatched', source: input.source || 'upload', at: Date.now(),
  };
  const patch = { [receiptKey(id)]: record(r) };
  if (file) patch[fileKey(id)] = { name: file.name || 'Receipt', type: file.type || 'image/jpeg', src: file.src };
  return { id, patch, receipt: r };
}

/** Transactions this receipt could belong to, best first. */
export function receiptCandidates(books, receipt, limit = 4) {
  if (receipt.amountCents === null || !receipt.date) return [];
  const want = -receipt.amountCents;
  const taken = new Set(books.receipts.filter((o) => o.id !== receipt.id && o.transactionId).map((o) => o.transactionId));
  const from = addDays(receipt.date, -MATCH_BEFORE);
  const to = addDays(receipt.date, MATCH_AFTER);
  const vendorWords = merchantKey(receipt.vendor).split(' ').filter((w) => w.length >= 3);
  return books.transactions
    .filter((t) => (t.accountId === SAMPLE_ACCOUNT) === (receipt.source === 'sample'))
    .filter((t) => t.date >= from && t.date <= to && Math.sign(t.amountCents) === Math.sign(want) && !taken.has(t.id))
    .filter((t) => Math.abs(t.amountCents) >= Math.abs(want) * 0.75 && Math.abs(t.amountCents) <= Math.abs(want) * 1.35)
    .map((t) => {
      const exact = t.amountCents === want;
      const sameVendor = vendorWords.length > 0 && vendorWords.some((w) => t.merchantKey.includes(w) || t.description.toUpperCase().includes(w));
      const days = Math.abs(daysBetween(receipt.date, t.date));
      const score = (exact ? 10 : 0) + (sameVendor ? 6 : 0) - days * 0.5;
      const reason = [exact ? 'same amount' : 'close amount', sameVendor ? 'same vendor' : '', days === 0 ? 'same day' : `${days} day${days === 1 ? '' : 's'} apart`].filter(Boolean).join(', ');
      return { tx: t, score, reason, exact, sameVendor };
    })
    .filter((c) => c.exact || c.sameVendor)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * The one clear match: the same amount from the same vendor. A charge that
 * only has the same amount is offered as a suggestion, never linked on its own.
 */
export function autoMatchFor(books, receipt) {
  if (receipt.status !== 'unmatched') return null;
  const vendor = receiptCandidates(books, receipt, 50).filter((c) => c.exact && c.sameVendor);
  return vendor.length === 1 ? vendor[0].tx.id : null;
}

/** Tries every waiting receipt again (after an import). Returns { patch, matched }. */
export function matchWaitingPatch(books) {
  const patch = {};
  let matched = 0;
  const working = { ...books, receipts: [...books.receipts] };
  for (const r of books.receipts) {
    const txId = autoMatchFor(working, r);
    if (!txId) continue;
    const linked = { ...r, status: 'matched', transactionId: txId, matchKind: 'auto' };
    patch[receiptKey(r.id)] = record(linked);
    working.receipts = working.receipts.map((x) => (x.id === r.id ? linked : x));
    matched += 1;
  }
  return { patch, matched };
}

const change = (r, c) => ({ [receiptKey(r.id)]: record({ ...r, ...c }) });
export const linkReceiptPatch = (r, txId, kind = 'manual') => change(r, { status: 'matched', transactionId: txId, matchKind: kind });
export const unlinkReceiptPatch = (r) => change(r, { status: 'unmatched', transactionId: null, matchKind: '' });
export const ignoreReceiptPatch = (r, ignored) => change(r, { status: ignored ? 'ignored' : r.transactionId ? 'matched' : 'unmatched' });
export const deleteReceiptPatch = (r) => ({ [receiptKey(r.id)]: null, [fileKey(r.id)]: null });

export function updateReceiptPatch(r, input) {
  return change(r, {
    vendor: (input.vendor ?? r.vendor).trim(),
    amountCents: input.amountCents === undefined ? r.amountCents : Number.isFinite(input.amountCents) ? Math.abs(input.amountCents) : null,
    date: ISO.test(input.date) ? input.date : r.date,
  });
}

/** Records a cash or unimported-card receipt as a new expense and links it. */
export function receiptToTransactionPatch(books, r, accountId) {
  if (r.amountCents === null || !r.date) throw new Error('The receipt needs an amount and a date first.');
  // The new expense's id comes from the receipt, so two people clicking at once land on one expense.
  const { id, patch } = addTransactionPatch(books, { id: `x${r.id}`, date: r.date, description: r.vendor || 'Receipt', amountCents: -r.amountCents, accountId });
  return { ...patch, ...linkReceiptPatch(r, id, 'created') };
}
