import React from 'react';

// Minimal ANSI SGR renderer for logs and exec output: bold, dim, italic,
// underline and the 16 standard colours, mapped to theme classes so output
// follows the board look instead of hard-coded terminal colours. Other
// escape sequences (cursor moves, OSC titles) are dropped.

// eslint-disable-next-line no-control-regex
const SEQ = /\u001b\[([0-9;]*)([A-Za-z])|\u001b\][^\u0007]*\u0007|\u001b[()][A-Z0-9]/g;

export function stripAnsi(text) {
  return String(text ?? '').replace(SEQ, '');
}

function apply(style, params) {
  const codes = params === '' ? [0] : params.split(';').map((n) => Number(n) || 0);
  let next = { ...style };
  for (let i = 0; i < codes.length; i += 1) {
    const n = codes[i];
    if (n === 0) next = {};
    else if (n === 1) next.bold = true;
    else if (n === 2) next.dim = true;
    else if (n === 3) next.italic = true;
    else if (n === 4) next.underline = true;
    else if (n === 22) { next.bold = false; next.dim = false; }
    else if (n === 23) next.italic = false;
    else if (n === 24) next.underline = false;
    else if (n >= 30 && n <= 37) next.fg = n - 30;
    else if (n >= 90 && n <= 97) next.fg = n - 90 + 8;
    else if (n === 39) next.fg = undefined;
    else if (n >= 40 && n <= 47) next.bg = n - 40;
    else if (n === 49) next.bg = undefined;
    else if ((n === 38 || n === 48) && codes[i + 1] === 5) {
      // 256-colour: keep the first 16, fold the rest onto the default.
      const c = codes[i + 2];
      if (c < 16) next[n === 38 ? 'fg' : 'bg'] = c;
      i += 2;
    } else if ((n === 38 || n === 48) && codes[i + 1] === 2) i += 4;
  }
  return next;
}

/** Split text into [{ text, style }] runs. Exported for tests. */
export function parseAnsi(input) {
  const text = String(input ?? '');
  const runs = [];
  let style = {};
  let last = 0;
  SEQ.lastIndex = 0;
  for (let m = SEQ.exec(text); m; m = SEQ.exec(text)) {
    if (m.index > last) runs.push({ text: text.slice(last, m.index), style });
    if (m[2] === 'm') style = apply(style, m[1]);
    last = SEQ.lastIndex;
  }
  if (last < text.length) runs.push({ text: text.slice(last), style });
  return runs;
}

function className(style) {
  const c = [];
  if (style.fg != null) c.push(`dk-ansi-fg${style.fg % 8}${style.fg >= 8 ? ' dk-ansi-bright' : ''}`);
  if (style.bg != null) c.push(`dk-ansi-bg${style.bg % 8}`);
  if (style.bold) c.push('dk-ansi-b');
  if (style.dim) c.push('dk-ansi-dim');
  if (style.italic) c.push('dk-ansi-i');
  if (style.underline) c.push('dk-ansi-u');
  return c.join(' ');
}

function highlight(text, query, keyBase) {
  if (!query) return text;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const out = [];
  let from = 0;
  for (let at = lower.indexOf(q); at >= 0; at = lower.indexOf(q, from)) {
    if (at > from) out.push(text.slice(from, at));
    out.push(<mark key={`${keyBase}-${at}`} className="dk-hit">{text.slice(at, at + q.length)}</mark>);
    from = at + q.length;
  }
  if (from < text.length) out.push(text.slice(from));
  return out;
}

/** Render ANSI-coloured text, optionally marking matches of `query`. */
export function AnsiText({ text, query = '' }) {
  const runs = parseAnsi(text);
  if (runs.length === 1 && !className(runs[0].style)) return <>{highlight(runs[0].text, query, 0)}</>;
  return (
    <>
      {runs.map((r, i) => {
        const cls = className(r.style);
        const body = highlight(r.text, query, i);
        return cls ? <span key={i} className={cls}>{body}</span> : <React.Fragment key={i}>{body}</React.Fragment>;
      })}
    </>
  );
}
