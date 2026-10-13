// Evaluates a Censai Sheets workbook: every formula, across sheets, with
// lazy memoised recalculation and loop detection. Pure, no React.
//
//   const calc = evaluateBook(book, cells)
//   calc.value('s1', 'B4')   -> number | string | boolean | null | { err }
import { addr } from './cellRef.js';
import { parseFormula } from './formulaParse.js';
import { FUNCTIONS } from './formulaFns.js';
import {
  FormulaError, check, compare, err, isErr, isRange, literalValue, toBool, toNum, toText,
} from './formulaValues.js';

const MAX_RANGE_CELLS = 100000;
const astCache = new Map();

export function isFormula(raw) {
  return typeof raw === 'string' && raw.length > 1 && raw.startsWith('=');
}

function parseCached(raw) {
  if (!astCache.has(raw)) {
    let ast;
    try {
      ast = parseFormula(raw);
    } catch {
      ast = { t: 'err', v: '#ERROR!' };
    }
    if (astCache.size > 5000) astCache.clear();
    astCache.set(raw, ast);
  }
  return astCache.get(raw);
}

function arith(op, l, r) {
  const a = toNum(l);
  const b = toNum(r);
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/':
      if (b === 0) throw new FormulaError('#DIV/0!');
      return a / b;
    case '^': return a ** b;
    default: throw new FormulaError('#VALUE!');
  }
}

const COMPARE = {
  '=': (c) => c === 0, '<>': (c) => c !== 0, '<': (c) => c < 0, '>': (c) => c > 0, '<=': (c) => c <= 0, '>=': (c) => c >= 0,
};

export function evaluateBook(book, cells) {
  const sheets = book?.sheets || [];
  const byName = new Map(sheets.map((s) => [s.name.toLowerCase(), s.id]));
  const memo = new Map();
  const active = new Set();

  const sheetIdFor = (name, current) => {
    if (!name) return current;
    const id = byName.get(String(name).toLowerCase());
    if (!id) throw new FormulaError('#REF!');
    return id;
  };

  function value(sheetId, address) {
    const key = `${sheetId}!${address}`;
    if (memo.has(key)) return memo.get(key);
    const raw = cells?.[sheetId]?.[address]?.v;
    if (!isFormula(raw)) {
      const v = literalValue(raw);
      memo.set(key, v);
      return v;
    }
    if (active.has(key)) return err('#CIRC!');
    active.add(key);
    let result;
    try {
      result = evalNode(parseCached(raw), sheetId);
      if (isRange(result)) result = result.range[0]?.[0] ?? null;
      if (typeof result === 'number' && !Number.isFinite(result)) result = err('#NUM!');
    } catch (e) {
      result = err(e instanceof FormulaError ? e.code : '#VALUE!');
    }
    active.delete(key);
    memo.set(key, result);
    return result;
  }

  function evalNode(node, sheetId) {
    switch (node.t) {
      case 'num': case 'str': case 'bool': return node.v;
      case 'blank': return null;
      case 'err': throw new FormulaError(node.v);
      case 'name': throw new FormulaError('#NAME?');
      case 'ref': return check(value(sheetIdFor(node.sheet, sheetId), addr(node.col, node.row)));
      case 'range': {
        const target = sheetIdFor(node.sheet, sheetId);
        if ((node.c2 - node.c1 + 1) * (node.r2 - node.r1 + 1) > MAX_RANGE_CELLS) throw new FormulaError('#REF!');
        const range = [];
        for (let r = node.r1; r <= node.r2; r += 1) {
          const row = [];
          for (let c = node.c1; c <= node.c2; c += 1) row.push(value(target, addr(c, r)));
          range.push(row);
        }
        return { range };
      }
      case 'neg': return -toNum(scalar(node.e, sheetId));
      case 'pct': return toNum(scalar(node.e, sheetId)) / 100;
      case 'bin': {
        const l = scalar(node.l, sheetId);
        const r = scalar(node.r, sheetId);
        if (node.op === '&') return toText(l) + toText(r);
        if (COMPARE[node.op]) return COMPARE[node.op](compare(check(l), check(r)));
        return arith(node.op, l, r);
      }
      case 'fn': return callFn(node, sheetId);
      default: throw new FormulaError('#VALUE!');
    }
  }

  function scalar(node, sheetId) {
    const v = evalNode(node, sheetId);
    if (!isRange(v)) return v;
    if (v.range.length === 1 && v.range[0].length === 1) return check(v.range[0][0]);
    throw new FormulaError('#VALUE!');
  }

  function soft(node, sheetId) {
    try {
      return evalNode(node, sheetId);
    } catch (e) {
      if (e instanceof FormulaError) return err(e.code);
      throw e;
    }
  }

  function callFn(node, sheetId) {
    const { name, args } = node;
    if (name === 'IF') {
      if (args.length < 2 || args.length > 3) throw new FormulaError('#N/A');
      const branch = toBool(scalar(args[0], sheetId)) ? args[1] : args[2];
      return branch ? evalNode(branch, sheetId) : false;
    }
    if (name === 'IFERROR') {
      if (args.length !== 2) throw new FormulaError('#N/A');
      const v = soft(args[0], sheetId);
      return isErr(v) ? evalNode(args[1], sheetId) : v;
    }
    if (name === 'IFS') {
      for (let i = 0; i + 1 < args.length; i += 2) {
        if (toBool(scalar(args[i], sheetId))) return evalNode(args[i + 1], sheetId);
      }
      throw new FormulaError('#N/A');
    }
    const fn = FUNCTIONS[name];
    if (!fn) throw new FormulaError('#NAME?');
    const values = args.map((a) => soft(a, sheetId));
    // ISERROR looks at errors; everything else fails on the first one.
    if (name !== 'ISERROR') values.forEach((v) => { if (!isRange(v)) check(v); });
    return fn(values);
  }

  return { value };
}

/** Which cells a formula reads, for highlighting while editing. */
export function formulaRefs(raw) {
  if (!isFormula(raw)) return [];
  const out = [];
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (n.t === 'ref') out.push({ sheet: n.sheet, c1: n.col, r1: n.row, c2: n.col, r2: n.row });
    if (n.t === 'range') out.push({ sheet: n.sheet, c1: n.c1, r1: n.r1, c2: n.c2, r2: n.r2 });
    ['l', 'r', 'e'].forEach((k) => walk(n[k]));
    (n.args || []).forEach(walk);
  };
  walk(parseCached(raw));
  return out;
}
