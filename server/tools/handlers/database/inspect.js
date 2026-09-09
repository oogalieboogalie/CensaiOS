import pool from '../../../db.js';

export async function dbInspect(args) {
  const action = args.action || 'list_tables';

  if (action === 'list_tables') {
    try {
      const res = await pool.query(
        `SELECT table_name, table_type
         FROM information_schema.tables
         WHERE table_schema = 'public'
         ORDER BY table_name`
      );
      if (res.rows.length === 0) return 'No tables found in the public schema.';
      const header = 'TABLE NAME'.padEnd(40) + 'TYPE';
      const divider = '-'.repeat(60);
      const rows = res.rows.map(r =>
        r.table_name.padEnd(40) + r.table_type
      ).join('\n');
      return `${header}\n${divider}\n${rows}`;
    } catch (err) {
      return `db_inspect list_tables error: ${err.message}`;
    }
  }

  if (action === 'describe') {
    if (!args.table) return 'db_inspect describe requires args.table to be set.';
    try {
      const colRes = await pool.query(
        `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [args.table]
      );
      if (colRes.rows.length === 0) {
        return `No columns found for table "${args.table}". Does it exist in the public schema?`;
      }

      const colHeader = 'COLUMN'.padEnd(30) + 'TYPE'.padEnd(25) + 'NULLABLE'.padEnd(12) + 'DEFAULT';
      const divider = '-'.repeat(90);
      const colRows = colRes.rows.map(r =>
        (r.column_name || '').padEnd(30) +
        (r.data_type || '').padEnd(25) +
        (r.is_nullable || '').padEnd(12) +
        (r.column_default != null ? r.column_default : '')
      ).join('\n');

      const idxRes = await pool.query(
        `SELECT indexname, indexdef
         FROM pg_indexes
         WHERE schemaname = 'public' AND tablename = $1`,
        [args.table]
      );
      const idxSection = idxRes.rows.length === 0
        ? '\nINDEXES\n' + '-'.repeat(90) + '\n(none)'
        : '\nINDEXES\n' + '-'.repeat(90) + '\n' +
          idxRes.rows.map(r => `${r.indexname}\n  ${r.indexdef}`).join('\n');

      return `COLUMNS for "${args.table}"\n${colHeader}\n${divider}\n${colRows}\n${idxSection}`;
    } catch (err) {
      return `db_inspect describe error: ${err.message}`;
    }
  }

  if (action === 'constraints') {
    if (!args.table) return 'db_inspect constraints requires args.table to be set.';
    try {
      const res = await pool.query(
        `SELECT constraint_name, constraint_type
         FROM information_schema.table_constraints
         WHERE table_schema = 'public' AND table_name = $1`,
        [args.table]
      );
      if (res.rows.length === 0) return `No constraints found for table "${args.table}".`;
      const header = 'CONSTRAINT NAME'.padEnd(45) + 'TYPE';
      const divider = '-'.repeat(65);
      const rows = res.rows.map(r =>
        (r.constraint_name || '').padEnd(45) + (r.constraint_type || '')
      ).join('\n');
      return `CONSTRAINTS for "${args.table}"\n${header}\n${divider}\n${rows}`;
    } catch (err) {
      return `db_inspect constraints error: ${err.message}`;
    }
  }

  return `Unknown db_inspect action "${action}". Valid actions: list_tables, describe, constraints.`;
}

export function postgresToolInfo() {
  return [
    'Nexus Postgres tool surface:',
    '- db_inspect({ action, table? }): quick schema list/describe/constraints.',
    '- postgres_schema_audit({ include_counts? }): find duplicate table names across schemas, duplicate migration numbers, live-vs-migration drift, and table counts.',
    '- postgres_table_sample({ table, limit? }): inspect columns, indexes, constraints, approximate count, and sample rows.',
    '- postgres_query({ sql, params?, limit?, allow_write?, allow_unsafe? }): run SQL directly. Reads are allowed by default; writes require allow_write=true; dangerous SQL requires allow_unsafe=true too.',
    '- postgres_exec_file({ file_path, dry_run?, allow_write?, allow_unsafe? }): preview or execute a repo-local .sql file with the same safety gates.',
    '',
    'Recommended duplicate cleanup workflow:',
    '1. postgres_schema_audit({ include_counts: true })',
    '2. postgres_table_sample({ table: "schema.table" }) for any suspicious table',
    '3. postgres_query(...) for focused catalog checks',
    '4. create_sub_agent(...) or dispatch_squad(...) for schema reviewers/builders when changes touch migrations or app code',
    '5. postgres_exec_file({ file_path, dry_run: true }) before applying migration files',
  ].join('\n');
}

export async function postgresTableSample(args) {
  const tableRef = parseTableRef(args.table);
  if (!tableRef) return 'postgres_table_sample requires a table name.';
  const limit = normalizeLimit(args.limit, 5, 50);

  try {
    const exists = await pool.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = $1 AND table_name = $2
       LIMIT 1`,
      [tableRef.schema, tableRef.table]
    );
    if (exists.rows.length === 0) return `No table found for "${tableRef.schema}.${tableRef.table}".`;

    const columns = await pool.query(
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2
       ORDER BY ordinal_position`,
      [tableRef.schema, tableRef.table]
    );
    const indexes = await pool.query(
      `SELECT indexname, indexdef
       FROM pg_indexes
       WHERE schemaname = $1 AND tablename = $2
       ORDER BY indexname`,
      [tableRef.schema, tableRef.table]
    );
    const constraints = await pool.query(
      `SELECT constraint_name, constraint_type
       FROM information_schema.table_constraints
       WHERE table_schema = $1 AND table_name = $2
       ORDER BY constraint_name`,
      [tableRef.schema, tableRef.table]
    );
    const count = await pool.query(
      `SELECT reltuples::bigint AS approximate_rows
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND c.relname = $2`,
      [tableRef.schema, tableRef.table]
    );
    const sample = await pool.query(
      `SELECT * FROM ${quoteIdent(tableRef.schema)}.${quoteIdent(tableRef.table)} LIMIT ${limit}`
    );

    return JSON.stringify({
      table: `${tableRef.schema}.${tableRef.table}`,
      approximateRows: count.rows[0]?.approximate_rows ?? null,
      columns: columns.rows,
      constraints: constraints.rows,
      indexes: indexes.rows,
      sample: sample.rows,
    }, null, 2);
  } catch (err) {
    return `postgres_table_sample error: ${err.message}`;
  }
}

function normalizeLimit(value, fallback, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

function parseTableRef(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const cleaned = text.replace(/"/g, '');
  const parts = cleaned.split('.').filter(Boolean);
  if (parts.length === 1) return { schema: 'public', table: parts[0] };
  return { schema: parts[0], table: parts.slice(1).join('.') };
}

function quoteIdent(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}
