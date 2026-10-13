import { evaluateBook, formulaRefs } from '../src/lib/office/sheetEval.js';
import { parseFormula } from '../src/lib/office/formulaParse.js';
import { literalValue } from '../src/lib/office/formulaValues.js';
import { formatValue } from '../src/lib/office/sheetBook.js';
import { chartData } from '../src/lib/office/sheetChart.js';

const book = { sheets: [{ id: 's1', name: 'Budget' }, { id: 's2', name: 'Q3 plan' }] };

function calcOf(s1, s2 = {}) {
  const wrap = (cells) => Object.fromEntries(Object.entries(cells).map(([a, v]) => [a, { v }]));
  const calc = evaluateBook(book, { s1: wrap(s1), s2: wrap(s2) });
  return (address, sheet = 's1') => calc.value(sheet, address);
}

describe('Censai Sheets formulas', () => {
  test('arithmetic follows Excel precedence', () => {
    const v = calcOf({ A1: '10', A2: '=A1*2+1', A3: '=(A1+2)^2', A4: '=-A1^2', A5: '=50%', A6: '=10/4', A7: '="a"&A1' });
    expect(v('A2')).toBe(21);
    expect(v('A3')).toBe(144);
    expect(v('A4')).toBe(100);
    expect(v('A5')).toBe(0.5);
    expect(v('A6')).toBe(2.5);
    expect(v('A7')).toBe('a10');
  });

  test('the common functions work over ranges', () => {
    const v = calcOf({
      A1: '10', A2: '20', A3: 'apple', A4: '30',
      B1: '=SUM(A1:A4)', B2: '=AVERAGE(A1:A4)', B3: '=MIN(A1:A4)', B4: '=MAX(A1:A4)', B5: '=COUNT(A1:A4)', B6: '=COUNTA(A1:A4)',
      B7: '=ROUND(2.345,2)', B8: '=IF(B1>50,"big","small")', B9: '=MEDIAN(A1:A4)', B10: '=UPPER(A3)&LEN(A3)',
      B11: '=SUMIF(A1:A4,">15")', B12: '=COUNTIF(A1:A4,"ap*")', B13: '=AND(A1>5,A2>5)', B14: '=CONCAT("x",A1:A2)',
    });
    expect([v('B1'), v('B2'), v('B3'), v('B4'), v('B5'), v('B6')]).toEqual([60, 20, 10, 30, 3, 4]);
    expect(v('B7')).toBe(2.35);
    expect(v('B8')).toBe('big');
    expect(v('B9')).toBe(20);
    expect(v('B10')).toBe('APPLE5');
    expect(v('B11')).toBe(50);
    expect(v('B12')).toBe(1);
    expect(v('B13')).toBe(true);
    expect(v('B14')).toBe('x1020');
  });

  test('lookups find values', () => {
    const v = calcOf({
      A1: 'Rent', B1: '1200', A2: 'Food', B2: '450', A3: 'Fuel', B3: '90',
      C1: '=VLOOKUP("food",A1:B3,2,FALSE)', C2: '=INDEX(A1:B3,3,2)', C3: '=MATCH("Fuel",A1:A3,0)', C4: '=VLOOKUP("Gym",A1:B3,2,FALSE)',
    });
    expect(v('C1')).toBe(450);
    expect(v('C2')).toBe(90);
    expect(v('C3')).toBe(3);
    expect(v('C4')).toEqual({ err: '#N/A' });
  });

  test('formulas reach across sheets by name, quoted when it has spaces', () => {
    const v = calcOf({ A1: "='Q3 plan'!A1*2", A2: '=Budget!A1+1' }, { A1: '21', A2: '=Budget!A2' });
    expect(v('A1')).toBe(42);
    expect(v('A2')).toBe(43);
    expect(v('A2', 's2')).toBe(43);
  });

  test('errors show instead of crashing, and IFERROR catches them', () => {
    const v = calcOf({ A1: '=1/0', A2: '=IFERROR(A1,"none")', A3: '=A1+1', A4: '=NOPE(1)', A5: '=SUM(1,', A6: '=Missing!A1', B1: '=B2', B2: '=B1' });
    expect(v('A1')).toEqual({ err: '#DIV/0!' });
    expect(v('A2')).toBe('none');
    expect(v('A3')).toEqual({ err: '#DIV/0!' });
    expect(v('A4')).toEqual({ err: '#NAME?' });
    expect(v('A5')).toEqual({ err: '#ERROR!' });
    expect(v('A6')).toEqual({ err: '#REF!' });
    expect(v('B1')).toEqual({ err: '#CIRC!' });
  });

  test('typed values: numbers, money, percents, booleans, forced text', () => {
    expect(literalValue('1,234.5')).toBe(1234.5);
    expect(literalValue('$12')).toBe(12);
    expect(literalValue('12%')).toBe(0.12);
    expect(literalValue('true')).toBe(true);
    expect(literalValue("'007")).toBe('007');
    expect(literalValue('')).toBe(null);
  });

  test('number formats', () => {
    expect(formatValue(1234.5, 'currency')).toBe('$1,234.50');
    expect(formatValue(0.125, 'percent')).toBe('12.5%');
    expect(formatValue(46304, 'date')).toBe('2026-10-09');
    expect(formatValue(0.1 + 0.2)).toBe('0.3');
  });

  test('the parser rejects bad syntax and lists references', () => {
    expect(() => parseFormula('=SUM(A1')).toThrow();
    expect(parseFormula('=LOG10(1)')).toEqual({ t: 'fn', name: 'LOG10', args: [{ t: 'num', v: 1 }] });
    expect(formulaRefs('=SUM(A1:B2)+C3')).toEqual([{ sheet: null, c1: 0, r1: 0, c2: 1, r2: 1 }, { sheet: null, c1: 2, r1: 2, c2: 2, r2: 2 }]);
  });

  test('chart series come from a labelled range', () => {
    const v = calcOf({ A1: 'Month', B1: 'Sales', A2: 'Jan', B2: '5', A3: 'Feb', B3: '8' });
    expect(chartData('A1:B3', (a) => v(a))).toEqual({ labels: ['Jan', 'Feb'], series: [{ name: 'Sales', values: [5, 8] }] });
  });
});
