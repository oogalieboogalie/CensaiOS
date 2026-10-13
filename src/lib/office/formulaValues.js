// Value helpers shared by the Censai Sheets evaluator and its functions.
// A value is a number, string, boolean, null (empty) or an error { err }.
// A range argument arrives as { range: [[v, …], …] } (rows of values).

export const err = (code) => ({ err: code });
export const isErr = (v) => Boolean(v && typeof v === 'object' && 'err' in v);
export const isRange = (v) => Boolean(v && typeof v === 'object' && Array.isArray(v.range));

export class FormulaError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/** Throw the first error found, so functions can bail out cleanly. */
export function check(v) {
  if (isErr(v)) throw new FormulaError(v.err);
  return v;
}

const NUMERIC_RE = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;

/** What a typed (non-formula) cell input means. */
export function literalValue(raw) {
  const text = String(raw ?? '');
  if (text === '') return null;
  if (text.startsWith("'")) return text.slice(1);
  const trimmed = text.trim();
  const plain = trimmed.replace(/,/g, '');
  if (NUMERIC_RE.test(plain) && /\d/.test(plain)) return Number(plain);
  const pct = /^([-+]?(\d+\.?\d*|\.\d+))%$/.exec(plain);
  if (pct) return Number(pct[1]) / 100;
  const money = /^([-+]?)\$(\d+\.?\d*|\.\d+)$/.exec(plain);
  if (money) return Number(`${money[1]}${money[2]}`);
  const upper = trimmed.toUpperCase();
  if (upper === 'TRUE' || upper === 'FALSE') return upper === 'TRUE';
  return text;
}

export function toNum(v) {
  check(v);
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = literalValue(String(v));
  if (typeof n === 'number') return n;
  throw new FormulaError('#VALUE!');
}

export function toText(v) {
  check(v);
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return formatGeneral(v);
  return String(v);
}

export function toBool(v) {
  check(v);
  if (typeof v === 'boolean') return v;
  if (v === null || v === '') return false;
  if (typeof v === 'number') return v !== 0;
  const upper = String(v).toUpperCase();
  if (upper === 'TRUE') return true;
  if (upper === 'FALSE') return false;
  throw new FormulaError('#VALUE!');
}

export function formatGeneral(n) {
  if (!Number.isFinite(n)) return '#NUM!';
  if (Number.isInteger(n)) return String(n);
  return String(Number(n.toPrecision(12)));
}

/** Flatten arguments (ranges included) into a list of values. */
export function flatten(args) {
  const out = [];
  for (const a of args) {
    if (isRange(a)) for (const row of a.range) out.push(...row);
    else out.push(a);
  }
  return out;
}

/**
 * Numbers for SUM-like functions: numbers inside ranges count, text and
 * empties inside ranges are skipped (as in Excel); direct args are coerced.
 */
export function numbers(args) {
  const out = [];
  for (const a of args) {
    if (isRange(a)) {
      for (const row of a.range) for (const v of row) {
        check(v);
        if (typeof v === 'number') out.push(v);
      }
    } else if (a !== null) {
      out.push(toNum(a));
    }
  }
  return out;
}

/** Excel-style comparison: numbers < text < booleans, text case-insensitive. */
export function compare(a, b) {
  const rank = (v) => (typeof v === 'number' || v === null ? 0 : typeof v === 'string' ? 1 : 2);
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) {
    if (a === null && typeof b === 'string') return b === '' ? 0 : -1;
    if (b === null && typeof a === 'string') return a === '' ? 0 : 1;
    return ra - rb;
  }
  if (ra === 0) return (a ?? 0) - (b ?? 0);
  if (ra === 1) {
    const x = a.toLowerCase();
    const y = b.toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  }
  return Number(a) - Number(b);
}

function wildcardRe(text) {
  const body = text.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${body}$`, 'i');
}

/** A SUMIF/COUNTIF criterion ("<5", "apple", "a*") as a test function. */
export function criterion(crit) {
  if (typeof crit === 'number' || typeof crit === 'boolean') return (v) => compare(v, crit) === 0 && v !== null;
  const text = String(crit ?? '');
  const m = /^(<=|>=|<>|<|>|=)?(.*)$/s.exec(text);
  const op = m[1] || '=';
  const target = literalValue(m[2]);
  const test = {
    '=': (c) => c === 0, '<>': (c) => c !== 0, '<': (c) => c < 0, '>': (c) => c > 0, '<=': (c) => c <= 0, '>=': (c) => c >= 0,
  }[op];
  if (typeof target === 'string' && /[*?]/.test(target) && (op === '=' || op === '<>')) {
    const re = wildcardRe(target);
    return (v) => (op === '=') === re.test(v === null ? '' : String(v));
  }
  return (v) => {
    if (isErr(v)) return false;
    if (target === null) return test(v === null || v === '' ? 0 : 1);
    if ((typeof target === 'number') !== (typeof v === 'number') && op !== '<>' && op !== '=') return false;
    if (typeof target === 'number' && typeof v !== 'number') return op === '<>';
    return test(compare(v, target));
  };
}
