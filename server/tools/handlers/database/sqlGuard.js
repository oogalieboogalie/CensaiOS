// Checks and wrapping for postgres_query, and for a postgres_exec_file read.
// This does not open a pool and does not change how the app connects.

const MULTI_STATEMENT_REJECTION =
  'postgres SQL rejected. Send one statement only, with no semicolon outside a quoted string.';

const BLOCKED_COMMAND_REJECTION =
  'postgres SQL rejected. DO, COPY, CALL and similar commands are not allowed.';

// Commands that run code, talk to the operating system, or end the
// transaction the tool opened. Matched after strings and comments are removed.
const BLOCKED_COMMAND = new RegExp(
  [
    String.raw`\b(?:do|copy|call|execute|prepare|deallocate|discard|load|checkpoint|listen|unlisten|notify|reassign|begin|commit|rollback|savepoint|abort)\b`,
    String.raw`\brelease\s+savepoint\b`,
    String.raw`\bsecurity\s+label\b`,
    String.raw`\bimport\s+foreign\b`,
    String.raw`\bset\s+(?:role|session|transaction)\b`,
    String.raw`\breset\s+(?:role|session|all)\b`,
  ].join('|'),
  'i',
);

const READ_FIRST = new Set(['select', 'with', 'show', 'explain', 'values', 'table']);

export function rejectUnsafeSql(sql) {
  const masked = maskSql(String(sql || ''));
  if (masked.includes(';')) return MULTI_STATEMENT_REJECTION;
  if (BLOCKED_COMMAND.test(masked)) return BLOCKED_COMMAND_REJECTION;
  return null;
}

// Read vs write comes from the first word that is left after the same
// cleaning rejectUnsafeSql uses. A comment regex is not a second opinion.
export function classifySql(sql) {
  const cleaned = maskSql(String(sql || '')).trim();
  const first = (cleaned.match(/^([a-z]+)/i)?.[1] || '').toLowerCase();
  const readOnly = READ_FIRST.has(first);
  const lowered = cleaned.toLowerCase();
  const unsafe = /\b(drop|truncate)\b/i.test(cleaned)
    || /\bdelete\s+from\s+[\w".]+(?:\s*;|$)/i.test(cleaned)
    || /\balter\s+system\b/i.test(cleaned)
    || /\bcreate\s+extension\b/i.test(cleaned)
    || lowered.includes('pg_terminate_backend');
  return { first, readOnly, writes: !readOnly, unsafe };
}

/**
 * Run one statement on a client reserved for this call.
 * Reads end in ROLLBACK. Writes end in COMMIT.
 * An empty values array makes node-pg use the simple query protocol, which
 * runs every statement in the string. queryMode "extended" keeps a single
 * statement even when there are no parameters.
 */
export async function runGuardedQuery(connect, sql, params, opts = {}) {
  const client = await connect();
  const values = Array.isArray(params) ? params : [];
  try {
    await client.query(opts.readOnly ? 'BEGIN READ ONLY' : 'BEGIN');
    await client.query('SET LOCAL statement_timeout = 15000');
    const result = await client.query({
      text: sql,
      values,
      queryMode: 'extended',
    });
    await client.query(opts.readOnly ? 'ROLLBACK' : 'COMMIT');
    if (Array.isArray(result.rows) && result.rows.length > opts.limit) {
      result.rows = result.rows.slice(0, opts.limit);
    }
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* the client may already be closed */ }
    throw err;
  } finally {
    client.release();
  }
}

function maskSql(sql) {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    const next = sql[i + 1];
    if (c === '-' && next === '-') {
      i = skipLineComment(sql, i);
      continue;
    }
    if (c === '/' && next === '*') {
      i = skipBlockComment(sql, i);
      continue;
    }
    if (c === "'" || c === '"') {
      i = skipQuote(sql, i, c);
      out += ' ';
      continue;
    }
    if (c === '$') {
      const tag = dollarTagAt(sql, i);
      if (tag) {
        const close = sql.indexOf(tag, i + tag.length);
        i = close === -1 ? sql.length : close + tag.length;
        out += ' ';
        continue;
      }
    }
    out += c;
    i += 1;
  }
  return out;
}

function skipLineComment(sql, start) {
  let i = start + 2;
  while (i < sql.length && sql[i] !== '\n' && sql[i] !== '\r') i += 1;
  return i < sql.length ? i + 1 : i;
}

function skipBlockComment(sql, start) {
  let i = start + 2;
  let depth = 1;
  while (i < sql.length && depth > 0) {
    if (sql[i] === '/' && sql[i + 1] === '*') {
      depth += 1;
      i += 2;
      continue;
    }
    if (sql[i] === '*' && sql[i + 1] === '/') {
      depth -= 1;
      i += 2;
      continue;
    }
    i += 1;
  }
  return i;
}

function skipQuote(sql, start, quote) {
  const escape = quote === "'" && isEscapeString(sql, start);
  let i = start + 1;
  while (i < sql.length) {
    if (escape && sql[i] === '\\') {
      i += i + 1 < sql.length ? 2 : 1;
      continue;
    }
    if (sql[i] === quote) {
      if (sql[i + 1] === quote) {
        i += 2;
        continue;
      }
      return i + 1;
    }
    i += 1;
  }
  return sql.length;
}

function isEscapeString(sql, quoteAt) {
  const mark = sql[quoteAt - 1];
  if (mark !== 'E' && mark !== 'e') return false;
  const before = sql[quoteAt - 2];
  return !(before && (isIdentPart(before) || before === '$'));
}

function dollarTagAt(sql, i) {
  if (sql[i] !== '$') return null;
  const prev = sql[i - 1];
  if (prev && (isIdentPart(prev) || prev === '$')) return null;
  if (sql[i + 1] === '$') return '$$';
  let j = i + 1;
  if (!isIdentStart(sql[j])) return null;
  j += 1;
  while (j < sql.length && isIdentPart(sql[j])) j += 1;
  if (sql[j] !== '$') return null;
  return sql.slice(i, j + 1);
}

function isIdentStart(ch) {
  return /[A-Za-z_\u0080-\uFFFF]/.test(ch || '');
}

function isIdentPart(ch) {
  return /[A-Za-z0-9_\u0080-\uFFFF]/.test(ch || '');
}
