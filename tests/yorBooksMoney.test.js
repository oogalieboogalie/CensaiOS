// YorWare Books: the second round of review fixes. Sample books stay apart
// from real ones, receipts only link themselves to the right vendor, the
// tax report says what is still a guess, dates and years read right, and
// the AI's answers are suggestions, not orders.
import { MAIN_ACCOUNT, SAMPLE_ACCOUNT, importRowsPatch, readBooks } from '../src/lib/yorware/books/booksModel.js';
import { demoBooksPatch, removeSamplePatch } from '../src/lib/yorware/books/booksDemo.js';
import { addReceiptPatch, autoMatchFor, matchWaitingPatch, receiptCandidates, receiptToTransactionPatch } from '../src/lib/yorware/books/booksReceipts.js';
import { aiAnswersPatch, deleteTxPatch, logMetricPatch } from '../src/lib/yorware/books/booksEdits.js';
import { timelineData, unreviewedTotals } from '../src/lib/yorware/books/booksQueries.js';
import { buildBuckets } from '../src/lib/yorware/books/timeline.js';
import { buildScheduleC, estimateSelfEmploymentTax, scheduleCCsv } from '../src/lib/yorware/books/reports.js';
import { categoryTotals } from '../src/lib/yorware/books/booksQueries.js';
import { parseDate, rowsFromCsv } from '../src/lib/yorware/books/csv.js';
import { moneyWhole } from '../src/components/yorware/books/BooksBits.jsx';
import { YORWARE_STARTERS } from '../src/lib/yorware/yorwareStarters.js';

const fresh = () => ({ id: 'w1', kind: 'yorBooks', ...YORWARE_STARTERS.yorBooks });
const importCsv = (win, csv, account = MAIN_ACCOUNT) => ({ ...win, ...importRowsPatch(readBooks(win), account, rowsFromCsv(csv).rows).patch });
const TODAY = '2026-10-15';

describe('sample books', () => {
  test('live in their own account, never block a real import, and come back out cleanly', () => {
    let win = { ...fresh(), ...logMetricPatch(readBooks(fresh()), { date: '2026-09-01', metric: 'contacts', value: 9 }) };
    win = { ...win, ...demoBooksPatch(win, TODAY) };
    let books = readBooks(win);
    expect(books.hasSample).toBe(true);
    expect(books.transactions.every((t) => t.accountId === SAMPLE_ACCOUNT)).toBe(true);
    expect(books.metrics.find((m) => m.date === '2026-09-01' && m.key === 'contacts').value).toBe(9);

    const adobe = books.transactions.find((t) => t.description.startsWith('ADOBE'));
    win = importCsv(win, `Date,Description,Amount\n${adobe.date.slice(5, 7)}/${adobe.date.slice(8)}/${adobe.date.slice(0, 4)},ADOBE *CREATIVE CLD,-59.99\n`);
    books = readBooks(win);
    expect(books.transactions.filter((t) => t.accountId === MAIN_ACCOUNT)).toHaveLength(1);

    win = { ...win, ...removeSamplePatch(win) };
    books = readBooks(win);
    expect(books.hasSample).toBe(false);
    expect(books.transactions.map((t) => t.description)).toEqual(['ADOBE *CREATIVE CLD']);
    expect(books.receipts).toEqual([]);
    expect(books.events).toEqual([]);
    expect(books.metrics).toEqual([{ date: '2026-09-01', key: 'contacts', value: 9 }]);
  });

  test("the sample's waiting receipt never grabs a real charge", () => {
    let win = { ...fresh(), ...demoBooksPatch(fresh(), TODAY) };
    win = importCsv(win, 'Date,Description,Amount\n10/14/2026,BLICK ART MATERIALS,-42.17\n');
    expect(matchWaitingPatch(readBooks(win)).matched).toBe(0);
  });
});

describe('receipts link themselves only to the right vendor', () => {
  test('same amount from a different store is a suggestion, not a link', () => {
    let win = importCsv(fresh(), 'Date,Description,Amount\n03/02/2026,HOME DEPOT #123,-42.17\n');
    const { receipt } = addReceiptPatch(readBooks(win), { vendor: 'Blick Art Materials', date: '2026-03-02', amountCents: 4217 });
    expect(autoMatchFor(readBooks(win), receipt)).toBeNull();
    win = importCsv(win, 'Date,Description,Amount\n03/03/2026,BLICK ART MATERIALS,-42.17\n');
    const books = readBooks(win);
    expect(books.transactions.find((t) => t.id === autoMatchFor(books, receipt)).description).toBe('BLICK ART MATERIALS');
    expect(receiptCandidates(books, receipt).length).toBe(2);
  });

  test('deleting a charge sends its receipt back to waiting', () => {
    let win = importCsv(fresh(), 'Date,Description,Amount\n03/02/2026,SHELL OIL,-45.12\n');
    win = { ...win, ...addReceiptPatch(readBooks(win), { vendor: 'Shell', date: '2026-03-02', amountCents: 4512 }).patch };
    win = { ...win, ...matchWaitingPatch(readBooks(win)).patch };
    const books = readBooks(win);
    win = { ...win, ...deleteTxPatch(books.transactions[0].id, books) };
    expect(readBooks(win).receipts[0]).toMatchObject({ status: 'unmatched', transactionId: null });
  });

  test('two people recording one receipt as an expense make one expense', () => {
    const books = readBooks(fresh());
    const { receipt } = addReceiptPatch(books, { vendor: 'Blick', date: '2026-03-02', amountCents: 4217 });
    const a = receiptToTransactionPatch(books, receipt, MAIN_ACCOUNT);
    const b = receiptToTransactionPatch(books, receipt, MAIN_ACCOUNT);
    expect(Object.keys(a).filter((k) => k.startsWith('bt.'))).toEqual(Object.keys(b).filter((k) => k.startsWith('bt.')));
  });
});

describe('the tax report', () => {
  test('says how much is still a guess, on screen and in the download', () => {
    const win = importCsv(fresh(), 'Date,Description,Amount\n03/02/2026,ZXQW HOLDINGS,5000.00\n03/03/2026,SHELL OIL,-45.12\n');
    const books = readBooks(win);
    const guess = unreviewedTotals(books, 2026);
    expect(guess).toEqual({ count: 1, inCents: 500000, outCents: 0 });
    expect(scheduleCCsv(buildScheduleC(categoryTotals(books, 2026), 2026), guess)).toContain('NOT FINAL: 1 transaction(s)');
    expect(scheduleCCsv(buildScheduleC(categoryTotals(books, 2026), 2026), { count: 0 })).not.toContain('NOT FINAL');
  });

  test('self-employment tax uses each year\'s own wage base', () => {
    expect(estimateSelfEmploymentTax(20_000_000, 2022).wageBaseCents).toBe(14_700_000);
    expect(estimateSelfEmploymentTax(20_000_000, 2023).wageBaseCents).toBe(16_020_000);
  });
});

describe('dates', () => {
  test('two-digit years, dates with a time zone, and impossible dates', () => {
    expect(parseDate('12/31/69')).toBe('1969-12-31');
    expect(parseDate('03/02/26')).toBe('2026-03-02');
    expect(parseDate('Thu, 01 Jan 2026 00:00:00 GMT')).toBe('2026-01-01');
    expect(parseDate('2/31/2026')).toBeNull();
    expect(parseDate('2/29/2024')).toBe('2024-02-29');
    expect(parseDate('2026-02-30')).toBeNull();
  });

  test('timeline totals stay inside the printed range', () => {
    const buckets = buildBuckets('2026-04-15', '2026-10-14', 'week');
    expect(buckets[0].start).toBe('2026-04-15');
    expect(buckets[buckets.length - 1].end).toBe('2026-10-14');
    const win = importCsv(fresh(), 'Date,Description,Amount\n04/13/2026,CLIENT A,100.00\n04/16/2026,CLIENT B,200.00\n10/18/2026,CLIENT C,300.00\n');
    const t = timelineData(readBooks(win), '2026-04-15', '2026-10-14', 'month');
    expect(t.buckets.reduce((s, b) => s + b.incomeCents, 0)).toBe(20000);
  });
});

describe("the AI's answers are suggestions", () => {
  test('a wild confidence on the wrong kind of category never clears review', () => {
    const win = importCsv(fresh(), 'Date,Description,Amount\n03/02/2026,ZXQW HOLDINGS,5000.00\n');
    const books = readBooks(win);
    const id = books.transactions[0].id;
    const out = aiAnswersPatch(win, books, [{ id, category_id: 'owner_draw', confidence: 5 }], undefined, [id]);
    expect(out.cleared).toBe(0);
    expect(readBooks({ ...win, ...out.patch }).transactions[0]).toMatchObject({ categoryId: 'owner_draw', needsReview: true });
  });

  test('answers for rows it was not asked about are ignored', () => {
    const win = importCsv(fresh(), 'Date,Description,Amount\n03/02/2026,ZXQW HOLDINGS,-80.00\n03/03/2026,QQQ LLC,-90.00\n');
    const [x, y] = readBooks(win).transactions;
    const out = aiAnswersPatch(win, readBooks(win), [{ id: x.id, category_id: 'supplies', confidence: 0.9 }, { id: y.id, category_id: 'supplies', confidence: 0.9 }], undefined, [x.id]);
    expect(out.updated).toBe(1);
  });
});

test('whole dollars round the same way for money in and money out', () => {
  expect(moneyWhole(-15050)).toBe(moneyWhole(15050).replace('$', '-$'));
});
