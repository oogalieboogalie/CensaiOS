// YorWare Books: fixes from the review of Open Books in censaiOS (money that
// was read wrong, real charges dropped as doubles, and receipt files that
// could run a teammate's code).
import { categorize, defaultClassifiers, REVIEW_THRESHOLD } from '../src/lib/yorware/books/engine.js';
import { parseAmountCents, rowsFromCsv } from '../src/lib/yorware/books/csv.js';
import { MAIN_ACCOUNT, importRowsPatch, readBooks } from '../src/lib/yorware/books/booksModel.js';
import { addReceiptPatch, updateReceiptPatch } from '../src/lib/yorware/books/booksReceipts.js';
import { receiptFileType, receiptThumbSrc } from '../src/components/yorware/books/receiptFiles.js';
import { dollarsToCents } from '../src/components/yorware/books/BooksBits.jsx';
import { YORWARE_STARTERS } from '../src/lib/yorware/yorwareStarters.js';

const sort = (description, amountCents) => categorize({ description, amountCents }, defaultClassifiers([]));
const booksWin = () => ({ id: 'w1', kind: 'yorBooks', ...YORWARE_STARTERS.yorBooks });

describe('receipt files never run code', () => {
  const page = { name: 'x', type: 'text/html', src: `data:text/html;base64,${Buffer.from('<script>alert(1)</script>').toString('base64')}` };

  test('a planted web page opens as a picture, not a page', () => {
    expect(receiptFileType(page)).toBe('image/jpeg');
    expect(receiptFileType({ type: 'application/pdf' })).toBe('application/pdf');
  });

  test('only real picture data is shown as a thumbnail', () => {
    expect(receiptThumbSrc(page)).toBe('');
    expect(receiptThumbSrc({ type: 'image/jpeg', src: 'https://tracker.example/pixel.png' })).toBe('');
    expect(receiptThumbSrc({ type: 'image/jpeg', src: 'data:image/svg+xml;base64,PHN2Zz4=' })).toBe('');
    expect(receiptThumbSrc({ type: 'image/jpeg', src: 'data:image/jpeg;base64,/9j/4AAQ' })).toBe('data:image/jpeg;base64,/9j/4AAQ');
  });
});

describe('"transfer" in the description', () => {
  test("a client's wire is not quietly left out of profit", () => {
    const s = sort('WIRE TRANSFER ACME CORP', 500000);
    expect(s.confidence).toBeLessThan(REVIEW_THRESHOLD);
  });

  test('any other keyword beats the word TRANSFER', () => {
    expect(sort('STRIPE TRANSFER', 120000).categoryId).not.toBe('transfer');
    expect(sort('ZELLE TRANSFER FROM JANE DOE', 25000).confidence).toBeLessThan(REVIEW_THRESHOLD);
    expect(sort('NETFLIX AUTOPAY', -1599).confidence).toBeLessThan(REVIEW_THRESHOLD);
  });

  test('real card payments and transfers between your own accounts still sort themselves', () => {
    expect(sort('INTERNAL TRANSFER TO SAVINGS', -50000)).toMatchObject({ categoryId: 'transfer' });
    expect(sort('INTERNAL TRANSFER TO SAVINGS', -50000).confidence).toBeGreaterThanOrEqual(REVIEW_THRESHOLD);
    expect(sort('PAYMENT THANK YOU', 30000).categoryId).toBe('transfer');
  });
});

describe('a second import keeps real charges', () => {
  test('a different order or a different store on the same day, same amount, is a new row', () => {
    let win = booksWin();
    const first = 'Date,Description,Amount\n03/02/2026,AMAZON MKTPL*AB12345 ORDER 111-2223334,-25.00\n03/02/2026,STARBUCKS STORE #1001,-6.50\n';
    win = { ...win, ...importRowsPatch(readBooks(win), MAIN_ACCOUNT, rowsFromCsv(first).rows).patch };
    const second = 'Date,Description,Amount\n03/02/2026,AMAZON MKTPL*CD67890 ORDER 111-9998887,-25.00\n03/02/2026,STARBUCKS STORE #2002,-6.50\n03/02/2026,STARBUCKS STORE #1001,-6.50\n';
    const out = importRowsPatch(readBooks(win), MAIN_ACCOUNT, rowsFromCsv(second).rows);
    expect(out).toMatchObject({ imported: 2, duplicates: 1 });
  });

  test('the same file twice still adds nothing, and two identical coffees both count', () => {
    let win = booksWin();
    const file = 'Date,Description,Amount\n03/03/2026,STARBUCKS STORE #1,-6.50\n03/03/2026,STARBUCKS STORE #1,-6.50\n';
    const once = importRowsPatch(readBooks(win), MAIN_ACCOUNT, rowsFromCsv(file).rows);
    expect(once.imported).toBe(2);
    win = { ...win, ...once.patch };
    expect(importRowsPatch(readBooks(win), MAIN_ACCOUNT, rowsFromCsv(file).rows)).toMatchObject({ imported: 0, duplicates: 2 });
  });
});

describe('amounts', () => {
  test('"Purchases are positive" does not undo a Type column or split columns', () => {
    const typed = 'Date,Description,Amount,Type\n03/02/2026,SHELL,59.99,Sale\n03/03/2026,CLIENT,100.00,Credit\n';
    expect(rowsFromCsv(typed, { flipSigns: true }).rows.map((r) => r.amountCents)).toEqual([-5999, 10000]);
    const split = 'Date,Description,Debit Amount,Credit Amount\n03/02/2026,SHELL,59.99,\n03/03/2026,CLIENT,,100.00\n';
    expect(rowsFromCsv(split, { flipSigns: true }).rows.map((r) => r.amountCents)).toEqual([-5999, 10000]);
    expect(rowsFromCsv('Date,Description,Amount\n03/02/2026,SHELL,59.99\n', { flipSigns: true }).rows[0].amountCents).toBe(-5999);
  });

  test('"Withdrawal Amount" / "Deposit Amount" files', () => {
    const csv = 'Date,Description,Withdrawal Amount,Deposit Amount\n03/02/2026,SHELL,59.99,\n03/03/2026,CLIENT,,"1,200.00"\n';
    expect(rowsFromCsv(csv).rows.map((r) => r.amountCents)).toEqual([-5999, 120000]);
  });

  test('minus signs never cancel, and comma decimals are read as decimals', () => {
    expect(parseAmountCents('(-12.34)')).toBe(-1234);
    expect(parseAmountCents('-12.34 DR')).toBe(-1234);
    expect(parseAmountCents('12,50')).toBe(1250);
    expect(parseAmountCents('1.234,56')).toBe(123456);
    expect(parseAmountCents('1,234')).toBe(123400);
    expect(parseAmountCents('1,234.56')).toBe(123456);
    expect(dollarsToCents('12,50')).toBe(1250);
    expect(dollarsToCents('$1,200')).toBe(120000);
    expect(dollarsToCents('-42.17')).toBe(-4217);
  });

  test('a receipt is always money paid, even if typed with a minus sign', () => {
    const { receipt } = addReceiptPatch(readBooks(booksWin()), { vendor: 'Blick', amountCents: -4217, date: '2026-03-02' });
    expect(receipt.amountCents).toBe(4217);
    expect(readBooks({ ...booksWin(), ...updateReceiptPatch(receipt, { amountCents: -500 }) }).receipts[0].amountCents).toBe(500);
  });
});
