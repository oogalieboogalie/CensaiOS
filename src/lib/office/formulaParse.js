// Formula parser for Censai Sheets: Excel-style syntax to a small AST.
//
//   =SUM(A1:A9) * 2      =IF(B2>10, "big", "small")      ='Q3 plan'!C4 & "!"
//
// Nodes: num, str, bool, err, ref {sheet,col,row}, range {sheet,c1,r1,c2,r2},
// fn {name,args}, bin {op,l,r}, neg {e}, pct {e}. Throws on bad syntax.
import { colIndex } from './cellRef.js';

const ERRORS = ['#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#N/A', '#NUM!', '#NULL!'];
const OPS2 = ['<=', '>=', '<>'];
const OPS1 = '+-*/^&=<>%(),:';

function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (ch === '"') {
      let s = '';
      i += 1;
      for (;;) {
        if (i >= src.length) throw new Error('Unclosed text');
        if (src[i] === '"') {
          if (src[i + 1] === '"') { s += '"'; i += 2; continue; }
          i += 1; break;
        }
        s += src[i]; i += 1;
      }
      out.push({ t: 'str', v: s });
      continue;
    }
    if (ch === "'") {
      const end = src.indexOf("'!", i + 1);
      if (end < 0) throw new Error('Bad sheet name');
      out.push({ t: 'sheet', v: src.slice(i + 1, end).replace(/''/g, "'") });
      i = end + 2;
      continue;
    }
    if (ch === '#') {
      const err = ERRORS.find((e) => src.slice(i, i + e.length).toUpperCase() === e);
      if (!err) throw new Error('Bad error value');
      out.push({ t: 'err', v: err });
      i += err.length;
      continue;
    }
    const num = /^(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(src.slice(i));
    if (num) { out.push({ t: 'num', v: Number(num[0]) }); i += num[0].length; continue; }
    const word = /^[A-Za-z_$][A-Za-z0-9_.$]*/.exec(src.slice(i));
    if (word) {
      const w = word[0];
      i += w.length;
      if (src[i] === '!') { out.push({ t: 'sheet', v: w }); i += 1; continue; }
      out.push({ t: 'word', v: w });
      continue;
    }
    const two = src.slice(i, i + 2);
    if (OPS2.includes(two)) { out.push({ t: 'op', v: two }); i += 2; continue; }
    if (OPS1.includes(ch)) { out.push({ t: 'op', v: ch }); i += 1; continue; }
    throw new Error(`Unexpected "${ch}"`);
  }
  return out;
}

const REF_RE = /^\$?([A-Za-z]{1,3})\$?(\d{1,6})$/;

function refFromWord(word, sheet) {
  const m = REF_RE.exec(word);
  if (!m) return null;
  return { t: 'ref', sheet, col: colIndex(m[1]), row: Number(m[2]) - 1 };
}

export function parseFormula(text) {
  const src = String(text || '').replace(/^=/, '');
  const toks = tokenize(src);
  let pos = 0;
  const peek = () => toks[pos];
  const isOp = (v) => peek()?.t === 'op' && peek().v === v;
  const take = () => toks[pos++];
  const expect = (v) => {
    if (!isOp(v)) throw new Error(`Expected "${v}"`);
    pos += 1;
  };

  const binary = (ops, next) => () => {
    let l = next();
    while (peek()?.t === 'op' && ops.includes(peek().v)) {
      const op = take().v;
      l = { t: 'bin', op, l, r: next() };
    }
    return l;
  };

  function primary() {
    const tok = take();
    if (!tok) throw new Error('Formula ends too early');
    if (tok.t === 'num') return { t: 'num', v: tok.v };
    if (tok.t === 'str') return { t: 'str', v: tok.v };
    if (tok.t === 'err') return { t: 'err', v: tok.v };
    if (tok.t === 'op' && tok.v === '(') {
      const e = comparison();
      expect(')');
      return e;
    }
    let sheet = null;
    let word = tok;
    if (tok.t === 'sheet') {
      sheet = tok.v;
      word = take();
      if (!word || word.t !== 'word') throw new Error('Expected a cell after the sheet name');
    }
    if (word.t !== 'word') throw new Error(`Unexpected "${word.v}"`);
    if (!sheet && isOp('(')) {
      take();
      const args = [];
      if (!isOp(')')) {
        do {
          if (isOp(',') || isOp(')')) args.push({ t: 'blank' });
          else args.push(comparison());
        } while (isOp(',') && take());
      }
      expect(')');
      return { t: 'fn', name: word.v.toUpperCase(), args };
    }
    const upper = word.v.toUpperCase();
    if (!sheet && (upper === 'TRUE' || upper === 'FALSE')) return { t: 'bool', v: upper === 'TRUE' };
    const ref = refFromWord(word.v, sheet);
    if (!ref) return { t: 'name', v: word.v };
    if (isOp(':')) {
      take();
      const endTok = take();
      const end = endTok?.t === 'word' ? refFromWord(endTok.v, sheet) : null;
      if (!end) throw new Error('Bad range');
      return {
        t: 'range', sheet,
        c1: Math.min(ref.col, end.col), r1: Math.min(ref.row, end.row),
        c2: Math.max(ref.col, end.col), r2: Math.max(ref.row, end.row),
      };
    }
    return ref;
  }

  function postfix() {
    let e = primary();
    while (isOp('%')) { take(); e = { t: 'pct', e }; }
    return e;
  }
  function unary() {
    if (isOp('-')) { take(); return { t: 'neg', e: unary() }; }
    if (isOp('+')) { take(); return unary(); }
    return postfix();
  }
  function power() {
    let l = unary();
    while (isOp('^')) { take(); l = { t: 'bin', op: '^', l, r: unary() }; }
    return l;
  }
  const product = binary(['*', '/'], power);
  const sum = binary(['+', '-'], product);
  const concat = binary(['&'], sum);
  const comparison = binary(['=', '<>', '<', '>', '<=', '>='], concat);

  const ast = comparison();
  if (pos < toks.length) throw new Error(`Unexpected "${toks[pos].v}"`);
  return ast;
}
