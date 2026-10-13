// The function library for Censai Sheets formulas. Each function gets its
// already-evaluated arguments (ranges as { range }) and returns a value.
// IF / IFERROR / IFS short-circuit in the evaluator instead.
import {
  FormulaError, check, compare, criterion, flatten, isErr, isRange, numbers, toBool, toNum, toText,
} from './formulaValues.js';

const DAY_MS = 86400000;
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/** A JS date as an Excel serial day number (local calendar day). */
export function dateSerial(date = new Date()) {
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((utc - EXCEL_EPOCH) / DAY_MS);
}

export function serialToDate(serial) {
  return new Date(EXCEL_EPOCH + Math.floor(serial) * DAY_MS);
}

const need = (args, min, max = min) => {
  if (args.length < min || args.length > max) throw new FormulaError('#N/A');
};
const roundTo = (n, digits, mode) => {
  const f = 10 ** digits;
  const x = n * f;
  const r = mode === 'up' ? Math.sign(x) * Math.ceil(Math.abs(x) - 1e-9)
    : mode === 'down' ? Math.sign(x) * Math.floor(Math.abs(x) + 1e-9)
      : Math.sign(x) * Math.round(Math.abs(x) + 1e-9);
  return r / f;
};
const rangeRows = (v) => (isRange(v) ? v.range : [[v]]);
const sum = (list) => list.reduce((a, b) => a + b, 0);

function ifs(args, kind) {
  const [rangeArg, critArg, sumArg] = args;
  const test = criterion(check(critArg));
  const rows = rangeRows(rangeArg);
  const sums = sumArg === undefined ? rows : rangeRows(sumArg);
  const picked = [];
  rows.forEach((row, r) => row.forEach((v, c) => {
    if (test(v)) picked.push(sums[r]?.[c] ?? null);
  }));
  if (kind === 'count') return picked.length;
  const nums = picked.filter((v) => typeof v === 'number');
  if (kind === 'sum') return sum(nums);
  if (!nums.length) throw new FormulaError('#DIV/0!');
  return sum(nums) / nums.length;
}

function lookup(args, byRow) {
  need(args, 3, 4);
  const [key, table, indexArg, approxArg] = args;
  const rows = rangeRows(table);
  const index = Math.trunc(toNum(indexArg)) - 1;
  const exact = approxArg === undefined ? false : !toBool(approxArg);
  const lines = byRow ? rows : rows[0].map((_, c) => rows.map((row) => row[c]));
  if (index < 0 || index >= (lines[0]?.length || 0)) throw new FormulaError('#REF!');
  const target = check(key);
  let hit = -1;
  if (exact || typeof target === 'string') {
    hit = lines.findIndex((line) => compare(line[0], target) === 0 && line[0] !== null);
  } else {
    lines.forEach((line, i) => { if (typeof line[0] === 'number' && compare(line[0], target) <= 0) hit = i; });
  }
  if (hit < 0) throw new FormulaError('#N/A');
  return lines[hit][index];
}

export const FUNCTIONS = {
  SUM: (a) => sum(numbers(a)),
  AVERAGE: (a) => {
    const n = numbers(a);
    if (!n.length) throw new FormulaError('#DIV/0!');
    return sum(n) / n.length;
  },
  MIN: (a) => { const n = numbers(a); return n.length ? Math.min(...n) : 0; },
  MAX: (a) => { const n = numbers(a); return n.length ? Math.max(...n) : 0; },
  COUNT: (a) => flatten(a).filter((v) => typeof v === 'number').length,
  COUNTA: (a) => flatten(a).filter((v) => v !== null && v !== '').length,
  COUNTBLANK: (a) => flatten(a).filter((v) => v === null || v === '').length,
  PRODUCT: (a) => numbers(a).reduce((x, y) => x * y, 1),
  MEDIAN: (a) => {
    const n = numbers(a).sort((x, y) => x - y);
    if (!n.length) throw new FormulaError('#NUM!');
    const mid = Math.floor(n.length / 2);
    return n.length % 2 ? n[mid] : (n[mid - 1] + n[mid]) / 2;
  },
  ROUND: (a) => { need(a, 1, 2); return roundTo(toNum(a[0]), toNum(a[1] ?? 0), 'near'); },
  ROUNDUP: (a) => { need(a, 1, 2); return roundTo(toNum(a[0]), toNum(a[1] ?? 0), 'up'); },
  ROUNDDOWN: (a) => { need(a, 1, 2); return roundTo(toNum(a[0]), toNum(a[1] ?? 0), 'down'); },
  INT: (a) => { need(a, 1); return Math.floor(toNum(a[0])); },
  ABS: (a) => { need(a, 1); return Math.abs(toNum(a[0])); },
  MOD: (a) => {
    need(a, 2);
    const d = toNum(a[1]);
    if (d === 0) throw new FormulaError('#DIV/0!');
    const n = toNum(a[0]);
    return n - d * Math.floor(n / d);
  },
  POWER: (a) => { need(a, 2); return toNum(a[0]) ** toNum(a[1]); },
  SQRT: (a) => {
    need(a, 1);
    const n = toNum(a[0]);
    if (n < 0) throw new FormulaError('#NUM!');
    return Math.sqrt(n);
  },
  PI: () => Math.PI,
  AND: (a) => flatten(a).filter((v) => v !== null).every((v) => toBool(v)),
  OR: (a) => flatten(a).filter((v) => v !== null).some((v) => toBool(v)),
  NOT: (a) => { need(a, 1); return !toBool(a[0]); },
  CONCAT: (a) => flatten(a).map(toText).join(''),
  CONCATENATE: (a) => a.map(toText).join(''),
  LEN: (a) => { need(a, 1); return toText(a[0]).length; },
  UPPER: (a) => { need(a, 1); return toText(a[0]).toUpperCase(); },
  LOWER: (a) => { need(a, 1); return toText(a[0]).toLowerCase(); },
  TRIM: (a) => { need(a, 1); return toText(a[0]).trim().replace(/\s+/g, ' '); },
  LEFT: (a) => { need(a, 1, 2); return toText(a[0]).slice(0, Math.max(0, toNum(a[1] ?? 1))); },
  RIGHT: (a) => {
    need(a, 1, 2);
    const n = Math.max(0, toNum(a[1] ?? 1));
    const s = toText(a[0]);
    return n ? s.slice(-n) : '';
  },
  MID: (a) => { need(a, 3); const start = Math.max(1, toNum(a[1])); return toText(a[0]).substr(start - 1, Math.max(0, toNum(a[2]))); },
  SUMIF: (a) => { need(a, 2, 3); return ifs(a, 'sum'); },
  COUNTIF: (a) => { need(a, 2); return ifs(a, 'count'); },
  AVERAGEIF: (a) => { need(a, 2, 3); return ifs(a, 'avg'); },
  VLOOKUP: (a) => lookup(a, true),
  HLOOKUP: (a) => lookup(a, false),
  INDEX: (a) => {
    need(a, 2, 3);
    const rows = rangeRows(a[0]);
    const r = Math.trunc(toNum(a[1])) - 1;
    const c = a[2] === undefined ? 0 : Math.trunc(toNum(a[2])) - 1;
    const row = rows.length === 1 && a[2] === undefined ? rows[0] : null;
    const value = row ? row[r] : rows[r]?.[c];
    if (value === undefined) throw new FormulaError('#REF!');
    return value;
  },
  MATCH: (a) => {
    need(a, 2, 3);
    const list = flatten([a[1]]);
    const type = a[2] === undefined ? 1 : toNum(a[2]);
    const target = check(a[0]);
    let hit = -1;
    if (type === 0) hit = list.findIndex((v) => v !== null && compare(v, target) === 0);
    else list.forEach((v, i) => { if (v !== null && (type > 0 ? compare(v, target) <= 0 : compare(v, target) >= 0)) hit = i; });
    if (hit < 0) throw new FormulaError('#N/A');
    return hit + 1;
  },
  ISBLANK: (a) => { need(a, 1); return a[0] === null; },
  ISNUMBER: (a) => { need(a, 1); return typeof a[0] === 'number'; },
  ISTEXT: (a) => { need(a, 1); return typeof a[0] === 'string'; },
  ISERROR: (a) => { need(a, 1); return isErr(a[0]); },
  TODAY: () => dateSerial(),
  NOW: () => {
    const d = new Date();
    return dateSerial(d) + (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400;
  },
  DATE: (a) => { need(a, 3); return dateSerial(new Date(toNum(a[0]), toNum(a[1]) - 1, toNum(a[2]))); },
  YEAR: (a) => { need(a, 1); return serialToDate(toNum(a[0])).getUTCFullYear(); },
  MONTH: (a) => { need(a, 1); return serialToDate(toNum(a[0])).getUTCMonth() + 1; },
  DAY: (a) => { need(a, 1); return serialToDate(toNum(a[0])).getUTCDate(); },
};

export const FUNCTION_NAMES = Object.freeze(['IF', 'IFERROR', 'IFS', ...Object.keys(FUNCTIONS)].sort());
