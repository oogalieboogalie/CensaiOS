// Shared qs differential battery: imported by the freeze probe (registry qs)
// and by tests/qs-clone.test.js (the clone). Single source of truth — the
// oracle fixture only stores outputs, never inputs.
//
// ser() is an injective, JSON-safe encoding of the parse/stringify value
// domain: it preserves sparse-array holes, undefined, and null-prototype
// objects, which plain JSON.stringify would all flatten.

export function ser(v) {
  if (v === undefined) return { __undefined: true }
  if (v === null || typeof v !== 'object') return v
  if (Array.isArray(v)) {
    const out = { __array: true, length: v.length, items: [] }
    for (let i = 0; i < v.length; i++) {
      out.items.push(Object.prototype.hasOwnProperty.call(v, i) ? ser(v[i]) : { __hole: true })
    }
    return out
  }
  const proto = Object.getPrototypeOf(v)
  const entries = Object.keys(v).map(k => [k, ser(v[k])])
  return proto === null ? { __nullproto: true, entries } : { __object: true, entries }
}

export const serString = v => JSON.stringify(ser(v))

const D = iso => new Date(iso)
const vetoB = (str, _def, _cs, kind) => (kind === 'key' && str === 'b' ? null : _def(str))

export const CASES = [
  // ——— parse: basics ———
  { name: 'p-empty', kind: 'parse', input: '', options: undefined },
  { name: 'p-simple', kind: 'parse', input: 'a=b&c=d', options: undefined },
  { name: 'p-no-value', kind: 'parse', input: 'a&b=c', options: undefined },
  { name: 'p-empty-value', kind: 'parse', input: 'a=&b=c', options: undefined },
  { name: 'p-encoded', kind: 'parse', input: 'a%5Bb%5D=c+d', options: undefined },
  { name: 'p-prefix', kind: 'parse', input: '?a=b', options: { ignoreQueryPrefix: true } },
  { name: 'p-nested', kind: 'parse', input: 'a[b][c]=d', options: undefined },
  { name: 'p-brackets', kind: 'parse', input: 'a[]=b&a[]=c', options: undefined },
  { name: 'p-indices', kind: 'parse', input: 'a[1]=b&a[0]=c', options: undefined },
  { name: 'p-dup-combine', kind: 'parse', input: 'a=b&a=c', options: undefined },
  { name: 'p-dup-first', kind: 'parse', input: 'a=b&a=c', options: { duplicates: 'first' } },
  { name: 'p-dup-last', kind: 'parse', input: 'a=b&a=c', options: { duplicates: 'last' } },
  { name: 'p-bracket-equals', kind: 'parse', input: 'a[]=b=c', options: undefined },
  { name: 'p-key-veto', kind: 'parse', input: 'a=1&b=2', options: { decoder: vetoB } },
  // ——— parse: options matrix ———
  { name: 'p-dots', kind: 'parse', input: 'a.b=c', options: { allowDots: true } },
  { name: 'p-dots-off', kind: 'parse', input: 'a.b=c', options: undefined },
  { name: 'p-comma', kind: 'parse', input: 'a=b,c,d', options: { comma: true } },
  { name: 'p-comma-truncate', kind: 'parse', input: 'a=' + Array(30).fill('x').join(','), options: { comma: true } },
  { name: 'p-comma-throw', kind: 'parse', input: 'a=' + Array(30).fill('x').join(','), options: { comma: true, throwOnLimitExceeded: true }, expectError: true },
  { name: 'p-depth0', kind: 'parse', input: 'a[b][c]=d', options: { depth: 0 } },
  { name: 'p-depth1', kind: 'parse', input: 'a[b][c]=d', options: { depth: 1 } },
  { name: 'p-strict-depth', kind: 'parse', input: 'a[b][c]=d', options: { depth: 1, strictDepth: true }, expectError: true },
  { name: 'p-overflow-index', kind: 'parse', input: 'a[25]=x', options: undefined },
  { name: 'p-overflow-merge', kind: 'parse', input: 'a[0]=x&a[25]=y', options: undefined },
  { name: 'p-sparse-compact', kind: 'parse', input: 'a[1]=b&a[3]=c', options: undefined },
  { name: 'p-sparse-keep', kind: 'parse', input: 'a[1]=b&a[3]=c', options: { allowSparse: true } },
  { name: 'p-empty-arrays', kind: 'parse', input: 'a[]=&b[]=c', options: { allowEmptyArrays: true } },
  { name: 'p-no-parse-arrays', kind: 'parse', input: 'a[]=b', options: { parseArrays: false } },
  { name: 'p-proto-drop', kind: 'parse', input: '__proto__[x]=1&a=b', options: undefined },
  { name: 'p-proto-allow', kind: 'parse', input: 'a[__proto__]=x', options: { allowPrototypes: true } },
  { name: 'p-plain', kind: 'parse', input: 'a[b]=c', options: { plainObjects: true } },
  { name: 'p-strict-null', kind: 'parse', input: 'a&b=c', options: { strictNullHandling: true } },
  { name: 'p-sentinel-utf8', kind: 'parse', input: 'utf8=%E2%9C%93&a=%C3%A9', options: { charsetSentinel: true } },
  { name: 'p-sentinel-iso', kind: 'parse', input: 'utf8=%26%2310003%3B&a=%E9', options: { charsetSentinel: true } },
  { name: 'p-iso-entities', kind: 'parse', input: 'a=%26%2310003%3B', options: { charset: 'iso-8859-1', interpretNumericEntities: true } },
  { name: 'p-param-limit', kind: 'parse', input: 'a=1&b=2&c=3', options: { parameterLimit: 2, throwOnLimitExceeded: true }, expectError: true },
  { name: 'p-delim-semi', kind: 'parse', input: 'a=b;c=d', options: { delimiter: ';' } },
  { name: 'p-delim-regex', kind: 'parse', input: 'a=b;c=d', options: { delimiter: /[;]/ } },
  { name: 'p-decode-dots', kind: 'parse', input: 'a%2Eb=c', options: { decodeDotInKeys: true } },
  { name: 'p-combine-bracket-dup', kind: 'parse', input: 'a=b&a[]=c', options: undefined },
  { name: 'p-mixed-nesting', kind: 'parse', input: 'a[b][]=c&a[b][]=d&e[f][0]=g', options: undefined },
  { name: 'p-union-mismatch', kind: 'parse', input: 'a[b]=c&a=d', options: undefined },
  { name: 'p-bad-encoding', kind: 'parse', input: 'a=%E0%A4%A', options: undefined },
  { name: 'p-plus-space', kind: 'parse', input: 'a=hello+world', options: undefined },
  { name: 'p-nonstring-input', kind: 'parse', input: { a: 'b' }, options: undefined },
  // ——— parse: option validation errors ———
  { name: 'p-err-charset', kind: 'parse', input: 'a=b', options: { charset: 'utf-16' }, expectError: true },
  { name: 'p-err-duplicates', kind: 'parse', input: 'a=b', options: { duplicates: 'sometimes' }, expectError: true },
  { name: 'p-err-decoder', kind: 'parse', input: 'a=b', options: { decoder: 'nope' }, expectError: true },
  { name: 'p-err-throw-flag', kind: 'parse', input: 'a=b', options: { throwOnLimitExceeded: 'yes' }, expectError: true },
  // ——— stringify: basics ———
  { name: 's-flat', kind: 'stringify', input: { a: 'b', c: 'd' }, options: undefined },
  { name: 's-nested', kind: 'stringify', input: { a: { b: { c: 'd' } } }, options: undefined },
  { name: 's-repeat', kind: 'stringify', input: { q: 'x', ids: [1, 2] }, options: { arrayFormat: 'repeat' } },
  { name: 's-brackets', kind: 'stringify', input: { a: ['b', 'c'] }, options: { arrayFormat: 'brackets' } },
  { name: 's-comma', kind: 'stringify', input: { a: ['b', 'c'] }, options: { arrayFormat: 'comma' } },
  { name: 's-date', kind: 'stringify', input: { d: D('2020-01-02T03:04:05.006Z') }, options: undefined },
  { name: 's-null-loose', kind: 'stringify', input: { a: null, b: 'c' }, options: undefined },
  { name: 's-null-strict', kind: 'stringify', input: { a: null }, options: { strictNullHandling: true } },
  { name: 's-null-skip', kind: 'stringify', input: { a: null, b: 'c' }, options: { skipNulls: true } },
  { name: 's-undefined', kind: 'stringify', input: { a: undefined, b: 'c' }, options: undefined },
  { name: 's-empty-array', kind: 'stringify', input: { a: [] }, options: undefined },
  { name: 's-empty-array-allow', kind: 'stringify', input: { a: [] }, options: { allowEmptyArrays: true } },
  { name: 's-non-object', kind: 'stringify', input: 'nope', options: undefined },
  { name: 's-unicode', kind: 'stringify', input: { a: '✓ 𝌆 café' }, options: undefined },
  { name: 's-rfc1738', kind: 'stringify', input: { a: 'hello world' }, options: { format: 'RFC1738' } },
  // ——— stringify: options matrix ———
  { name: 's-dots', kind: 'stringify', input: { a: { b: 'c' } }, options: { allowDots: true } },
  { name: 's-encode-dots', kind: 'stringify', input: { 'a.b': 'c' }, options: { encodeDotInKeys: true } },
  { name: 's-encode-off', kind: 'stringify', input: { a: 'b c&d=e' }, options: { encode: false } },
  { name: 's-values-only', kind: 'stringify', input: { 'a b': 'c d' }, options: { encodeValuesOnly: true } },
  { name: 's-prefix', kind: 'stringify', input: { a: 'b' }, options: { addQueryPrefix: true } },
  { name: 's-delim-semi', kind: 'stringify', input: { a: 'b', c: 'd' }, options: { delimiter: ';' } },
  { name: 's-sort', kind: 'stringify', input: { c: 1, a: 2, b: 3 }, options: { sort: (x, y) => (x < y ? -1 : 1) } },
  { name: 's-filter-fn', kind: 'stringify', input: { a: 'b', c: 'd' }, options: { filter: (p, v) => (p === 'c' ? undefined : v) } },
  { name: 's-filter-arr', kind: 'stringify', input: { a: 'b', c: 'd' }, options: { filter: ['a'] } },
  { name: 's-serialize-date', kind: 'stringify', input: { d: D('2020-01-02T03:04:05.006Z') }, options: { serializeDate: d => String(d.getTime()) } },
  { name: 's-sentinel', kind: 'stringify', input: { a: 'b' }, options: { charsetSentinel: true } },
  { name: 's-sentinel-iso', kind: 'stringify', input: { a: 'b' }, options: { charsetSentinel: true, charset: 'iso-8859-1' } },
  { name: 's-depth-throw', kind: 'stringify', input: { a: { b: { c: 'd' } } }, options: { depth: 1 }, expectError: true },
  { name: 's-cyclic', kind: 'stringify', input: (() => { const o = { a: 1 }; o.self = o; return o })(), options: undefined, expectError: true },
  { name: 's-shared-subtree', kind: 'stringify', input: (() => { const s = { x: 1 }; return { a: s, b: s } })(), options: undefined },
  { name: 's-comma-null-safe', kind: 'stringify', input: { a: [null, 'x'] }, options: { arrayFormat: 'comma', encodeValuesOnly: true } },
  { name: 's-comma-roundtrip', kind: 'stringify', input: { a: ['x'] }, options: { arrayFormat: 'comma', commaRoundTrip: true } },
  { name: 's-symbol-bigint', kind: 'stringify', input: { a: Symbol('s'), b: 10n }, options: { encode: false } },
  { name: 's-iso-encode', kind: 'stringify', input: { a: 'é✓' }, options: { charset: 'iso-8859-1' } },
  { name: 's-buffer', kind: 'stringify', input: { a: Buffer.from([104, 105]) }, options: undefined },
  { name: 's-poisoned-ctor', kind: 'stringify', input: (() => { const o = { a: 'x' }; Object.defineProperty(o, 'constructor', { value: { isBuffer: 1 }, enumerable: false }); return { wrap: o }; })(), options: undefined },
  // ——— stringify: option validation errors ———
  { name: 's-err-format', kind: 'stringify', input: { a: 'b' }, options: { format: 'RFC-9000' }, expectError: true },
  { name: 's-err-encoder', kind: 'stringify', input: { a: 'b' }, options: { encoder: 42 }, expectError: true },
  { name: 's-err-charset', kind: 'stringify', input: { a: 'b' }, options: { charset: 'utf-16' }, expectError: true },
  { name: 's-err-comma-rt', kind: 'stringify', input: { a: 'b' }, options: { commaRoundTrip: 'yes' }, expectError: true },
  // ——— consumer + round-trips ———
  { name: 'c-googleapis', kind: 'stringify', input: { q: 'hello world', ids: [1, 2, 3], filter: { a: 'b c' } }, options: { arrayFormat: 'repeat' } },
  { name: 'c-roundtrip-flat', kind: 'roundtrip', input: { a: 'b', c: ['d', 'e'] }, options: undefined },
  { name: 'c-roundtrip-nested', kind: 'roundtrip', input: { a: { b: 'c d', e: [1, 2] } }, options: undefined },
  { name: 'c-roundtrip-dots', kind: 'roundtrip', input: { a: { b: 'c' } }, options: { stringify: { allowDots: true }, parse: { allowDots: true } } }
]
