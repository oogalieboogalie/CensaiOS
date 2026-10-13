import pool from '../../../db.js';
import fs from 'fs/promises';
import path from 'path';

export async function postgresQuery(args) {
  const sql = String(args.sql || '').trim();
  if (!sql) return 'postgres_query requires args.sql.';
  const classification = classifySql(sql);
  const guard = checkSqlGuard(classification, args);
  if (guard) return guard;

  const params = Array.isArray(args.params) ? args.params : [];
  const limit = normalizeLimit(args.limit, 100, 1000);
  try {
    const result = await runSql(sql, params, { readOnly: classification.readOnly, limit });
    return formatQueryResult(result, classification);
  } catch (err) {
    return `postgres_query error: ${err.message}`;
  }
}

export async function postgresExecFile(args) {
  const filePath = String(args.file_path || '').trim();
  if (!filePath) return 'postgres_exec_file requires args.file_path.';
  const resolved = resolveSqlFile(filePath);
  if (!resolved.ok) return resolved.error;

  try {
    const stat = await fs.stat(resolved.path);
    if (!stat.isFile()) return `postgres_exec_file path is not a file: ${resolved.display}`;
    if (stat.size > 2_000_000) return `postgres_exec_file refuses files over 2MB: ${resolved.display}`;
    const sql = (await fs.readFile(resolved.path, 'utf8')).trim();
    if (!sql) return `postgres_exec_file found an empty SQL file: ${resolved.display}`;

    const classification = classifySql(sql);
    if (args.dry_run) {
      return JSON.stringify({
        file: resolved.display,
        bytes: stat.size,
        classification,
        preview: sql.slice(0, 3000),
      }, null, 2);
    }

    const guard = checkSqlGuard(classification, args);
    if (guard) return guard;

    const result = await runSql(sql, [], { readOnly: classification.readOnly, limit: 100 });
    return `Executed ${resolved.display}\n${formatQueryResult(result, classification)}`;
  } catch (err) {
    return `postgres_exec_file error: ${err.message}`;
  }
}

function normalizeLimit(value, fallback, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

function classifySql(sql) {
  const withoutComments = sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ')
    .trim();
  const first = (withoutComments.match(/^([a-z]+)/i)?.[1] || '').toLowerCase();
  const lowered = withoutComments.toLowerCase();
  const readOnly = ['select', 'with', 'show', 'explain'].includes(first);
  const writes = /\b(insert|update|delete|create|alter|drop|truncate|grant|revoke|comment|vacuum|reindex|cluster|refresh\s+materialized\s+view)\b/i.test(withoutComments);
  const unsafe = /\b(drop|truncate)\b/i.test(withoutComments)
    || /\bdelete\s+from\s+[\w".]+(?:\s*;|$)/i.test(withoutComments)
    || /\balter\s+system\b/i.test(withoutComments)
    || /\bcreate\s+extension\b/i.test(withoutComments)
    || lowered.includes('pg_terminate_backend');
  return { first, readOnly: readOnly && !writes, writes, unsafe };
}

function checkSqlGuard(classification, args) {
  if ((classification.writes || !classification.readOnly) && !args.allow_write) {
    return 'postgres SQL write blocked. Re-run with allow_write=true after confirming the migration/data change is intended.';
  }
  if (classification.unsafe && !args.allow_unsafe) {
    return 'postgres SQL unsafe operation blocked. Re-run with allow_write=true and allow_unsafe=true only after confirming destructive SQL is intended.';
  }
  return null;
}

async function runSql(sql, params, opts = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL statement_timeout = 15000');
    if (opts.readOnly) await client.query('SET TRANSACTION READ ONLY');
    const result = await client.query(sql, params);
    await client.query('COMMIT');
    if (Array.isArray(result.rows) && result.rows.length > opts.limit) {
      result.rows = result.rows.slice(0, opts.limit);
    }
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    throw err;
  } finally {
    client.release();
  }
}

function formatQueryResult(result, classification) {
  return JSON.stringify({
    command: result.command,
    rowCount: result.rowCount,
    fields: result.fields?.map(f => f.name) || [],
    classification,
    rows: result.rows || [],
  }, null, 2);
}

function resolveSqlFile(filePath) {
  const root = process.cwd();
  const resolved = path.resolve(root, filePath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return { ok: false, error: `postgres_exec_file only accepts files inside ${root}.` };
  }
  if (path.extname(resolved).toLowerCase() !== '.sql') {
    return { ok: false, error: 'postgres_exec_file only executes .sql files.' };
  }
  return { ok: true, path: resolved, display: relative || path.basename(resolved) };
}
