// YorWare Books (Open Books in censaiOS): how the books live on the board,
// importing without doubles, rules that learn, receipts that match, the
// AI pass, and two people keeping the same books at once.
import * as Y from 'yjs';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import { MAIN_ACCOUNT, addTransactionPatch, importRowsPatch, makeBooks, readBooks } from '../src/lib/yorware/books/booksModel.js';
import {
  aiAnswersPatch, createRulePatch, deleteRulePatch, logMetricPatch, markReviewedPatch, setCategoryPatch,
} from '../src/lib/yorware/books/booksEdits.js';
import { addReceiptPatch, autoMatchFor, matchWaitingPatch, receiptCandidates } from '../src/lib/yorware/books/booksReceipts.js';
import { categoryTotals, periodDetail, reviewCount, timelineData } from '../src/lib/yorware/books/booksQueries.js';
import { aiCandidates, aiSortPrompt, assistantPrompt, parseAiSort } from '../src/lib/yorware/books/booksAi.js';
import { demoBooksPatch } from '../src/lib/yorware/books/booksDemo.js';
import { buildScheduleC } from '../src/lib/yorware/books/reports.js';
import { rowsFromCsv } from '../src/lib/yorware/books/csv.js';
import { YORWARE_STARTERS } from '../src/lib/yorware/yorwareStarters.js';

const BANK = 'Date,Description,Amount\n03/02/2026,SHELL OIL 57444,-45.12\n03/03/2026,STARBUCKS STORE #1,-6.50\n03/03/2026,STARBUCKS STORE #1,-6.50\n03/04/2026,STRIPE TRANSFER,1200.00\n03/05/2026,ZXQW HOLDINGS,-80.00\n';
const booksWin = (patch = {}) => ({ id: 'w1', kind: 'yorBooks', ...YORWARE_STARTERS.yorBooks, ...patch });
const imported = (win = booksWin()) => ({ ...win, ...importRowsPatch(readBooks(win), MAIN_ACCOUNT, rowsFromCsv(BANK).rows).patch });

describe('YorWare Books on the board', () => {
  test('a new window has one checking account and no transactions', () => {
    const books = readBooks(booksWin());
    expect(books.accounts.map((a) => a.name)).toEqual(['Business checking']);
    expect(books.transactions).toEqual([]);
    expect(makeBooks()).toEqual({ 'ba.main': expect.objectContaining({ type: 'checking' }) });
  });

  test('importing sorts every row and the same file twice adds nothing', () => {
    const win = imported();
    const books = readBooks(win);
    expect(books.transactions).toHaveLength(5);
    expect(books.transactions.find((t) => t.description.startsWith('SHELL')).categoryId).toBe('car_truck');
    expect(reviewCount(books)).toBe(1);
    const again = importRowsPatch(books, MAIN_ACCOUNT, rowsFromCsv(BANK).rows);
    expect(again).toMatchObject({ imported: 0, duplicates: 5 });
  });

  test('two people importing the same bank file at once still get one copy', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    const sync = () => {
      Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
      Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
    };
    const base = { wins: [{ x: 0, y: 0, w: 1180, h: 780, ...booksWin() }] };
    writeStateToDoc(a, null, base, 'local');
    sync();
    const edit = (d, win) => writeStateToDoc(d, base, { wins: [win] }, 'local');
    edit(a, imported(base.wins[0]));
    edit(b, imported(base.wins[0]));
    sync();
    for (const doc of [a, b]) expect(readBooks(readDocState(doc).wins[0]).transactions).toHaveLength(5);
  });

  test('two people fixing different transactions both land', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    const sync = () => {
      Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
      Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
    };
    const start = { x: 0, y: 0, w: 1180, h: 780, ...imported() };
    const base = { wins: [start] };
    writeStateToDoc(a, null, base, 'local');
    sync();
    const books = readBooks(start);
    const shell = books.transactions.find((t) => t.description.startsWith('SHELL'));
    const odd = books.transactions.find((t) => t.description.startsWith('ZXQW'));
    writeStateToDoc(a, base, { wins: [{ ...start, ...setCategoryPatch(start, books, shell.id, 'travel') }] }, 'local');
    writeStateToDoc(b, base, { wins: [{ ...start, ...setCategoryPatch(start, books, odd.id, 'supplies') }] }, 'local');
    sync();
    for (const doc of [a, b]) {
      const after = readBooks(readDocState(doc).wins[0]);
      expect(after.transactions.find((t) => t.id === shell.id).categoryId).toBe('travel');
      expect(after.transactions.find((t) => t.id === odd.id).categoryId).toBe('supplies');
    }
  });

  test('"Always for" makes a rule that re-sorts matching rows; deleting it puts them back', () => {
    let win = imported();
    const books = readBooks(win);
    const coffee = books.transactions.filter((t) => t.description.startsWith('STARBUCKS'));
    win = { ...win, ...setCategoryPatch(win, books, coffee[0].id, 'owner_draw', { remember: true }) };
    let after = readBooks(win);
    expect(after.rules).toEqual([expect.objectContaining({ pattern: 'STARBUCKS', direction: 'any', categoryId: 'owner_draw' })]);
    expect(after.transactions.filter((t) => t.description.startsWith('STARBUCKS')).map((t) => [t.categoryId, t.categorySource]).sort())
      .toEqual([['owner_draw', 'rule'], ['owner_draw', 'user']]);
    win = { ...win, ...deleteRulePatch(win, after, after.rules[0].id) };
    after = readBooks(win);
    expect(after.rules).toEqual([]);
    expect(after.transactions.find((t) => t.id === coffee[1].id).categoryId).toBe('meals');
    expect(after.transactions.find((t) => t.id === coffee[0].id).categoryId).toBe('owner_draw');
  });

  test('a typed rule covers existing rows; same rule twice is one rule', () => {
    let win = imported();
    const { patch, id } = createRulePatch(win, readBooks(win), { pattern: 'zxqw holdings', categoryId: 'contract_labor', direction: 'out' });
    win = { ...win, ...patch };
    expect(readBooks(win).transactions.find((t) => t.description.startsWith('ZXQW')).categoryId).toBe('contract_labor');
    expect(createRulePatch(win, readBooks(win), { pattern: 'ZXQW HOLDINGS', categoryId: 'supplies', direction: 'out' }).id).toBe(id);
    expect(() => createRulePatch(win, readBooks(win), { pattern: ' ', categoryId: 'supplies' })).toThrow('Enter the text');
  });

  test('hand-typed transactions, review, and the Schedule C totals', () => {
    let win = imported();
    win = { ...win, ...addTransactionPatch(readBooks(win), { date: '2026-03-06', description: 'Client lunch', amountCents: -4000, categoryId: 'meals' }).patch };
    const books = readBooks(win);
    const odd = books.transactions.find((t) => t.needsReview);
    win = { ...win, ...markReviewedPatch(win, odd.id) };
    expect(reviewCount(readBooks(win))).toBe(0);
    const s = buildScheduleC(categoryTotals(readBooks(win), 2026), 2026);
    expect(s.grossReceiptsCents).toBe(120000);
    expect(s.expenseLines.find((l) => l.line === '24b')).toMatchObject({ amountCents: 5300, deductibleCents: 2650 });
    expect(() => addTransactionPatch(books, { date: 'soon', description: 'x', amountCents: 1 })).toThrow('Enter a date');
  });

  test('a receipt saved before its charge matches when the charge is imported', () => {
    let win = booksWin();
    const added = addReceiptPatch(readBooks(win), { vendor: 'Shell', date: '2026-03-01', amountCents: 4512 });
    win = { ...win, ...added.patch };
    expect(autoMatchFor(readBooks(win), readBooks(win).receipts[0])).toBeNull();
    win = imported(win);
    const { patch, matched } = matchWaitingPatch(readBooks(win));
    expect(matched).toBe(1);
    win = { ...win, ...patch };
    const books = readBooks(win);
    const shell = books.transactions.find((t) => t.description.startsWith('SHELL'));
    expect(books.receipts[0]).toMatchObject({ status: 'matched', transactionId: shell.id, matchKind: 'auto' });
    expect(receiptCandidates(books, { ...books.receipts[0], status: 'unmatched', id: 'other' })).toEqual([]);
  });

  test('daily numbers replace the same day, and custom names become their own series', () => {
    let win = booksWin();
    win = { ...win, ...logMetricPatch(readBooks(win), { date: '2026-03-02', metric: 'contacts', value: 3 }) };
    win = { ...win, ...logMetricPatch(readBooks(win), { date: '2026-03-02', metric: 'contacts', value: 5 }) };
    win = { ...win, ...logMetricPatch(readBooks(win), { date: '2026-03-03', metric: 'Quotes sent', value: 2 }) };
    const books = readBooks(win);
    expect(books.metrics.sort((x, y) => x.date.localeCompare(y.date))).toEqual([
      { date: '2026-03-02', key: 'contacts', value: 5 }, { date: '2026-03-03', key: 'quotes_sent', value: 2 },
    ]);
    expect(timelineData(books, '2026-03-01', '2026-03-31', 'week').series.map((s) => s.name)).toEqual(['New contacts', 'Quotes sent']);
    expect(() => logMetricPatch(books, { date: '2026-03-02', metric: 'sales_count', value: 1 })).toThrow('counted automatically');
  });

  test('the AI pass reads answers out of a chatty reply and only clears confident ones', () => {
    const win = imported();
    const books = readBooks(win);
    const [batch] = aiCandidates(books);
    expect(aiSortPrompt(books, batch)).toContain('ZXQW HOLDINGS');
    const odd = batch[0];
    const answers = parseAiSort(`Sure!\n\`\`\`json\n{"results":[{"id":"${odd.id}","category_id":"contract_labor","confidence":0.9,"reason":"a contractor"}]}\n\`\`\``);
    const out = aiAnswersPatch(win, books, answers);
    expect(out).toMatchObject({ updated: 1, cleared: 1 });
    const after = readBooks({ ...win, ...out.patch }).transactions.find((t) => t.id === odd.id);
    expect(after).toMatchObject({ categoryId: 'contract_labor', categorySource: 'ai', needsReview: false });
    expect(parseAiSort('no json here')).toEqual([]);
  });

  test('the sample books fill the dashboard, timeline, receipts and the assistant brief', () => {
    const win = { ...booksWin(), ...demoBooksPatch(booksWin(), '2026-10-15') };
    const books = readBooks(win);
    expect(books.transactions.length).toBeGreaterThan(100);
    expect(books.events).toHaveLength(6);
    expect(books.receipts.filter((r) => r.status === 'matched').length).toBeGreaterThan(0);
    const t = timelineData(books, '2026-04-16', '2026-10-15', 'month');
    expect(t.series.map((s) => s.key)).toEqual(['contacts', 'appointments', 'sales_count']);
    const month = periodDetail(books, '2026-07-01', '2026-07-31');
    expect(month.transactionCount).toBeGreaterThan(5);
    const prompt = assistantPrompt(books, '2026-10-15', 'How was July?', 'Studio');
    expect(prompt).toContain('Year to date 2026');
    expect(prompt).toContain('Question: How was July?');
    expect(JSON.stringify(win).length).toBeLessThan(200_000);
  });
});
