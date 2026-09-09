import pool from '../../../db.js';
import fs from 'fs/promises';
import path from 'path';

export async function postgresSchemaAudit(args) {
  try {
    const audit = await buildSchemaAudit({ includeCounts: !!args.include_counts });
    return JSON.stringify(audit, null, 2);
  } catch (err) {
    return `postgres_schema_audit error: ${err.message}`;
  }
}

async function buildSchemaAudit({ includeCounts = false } = {}) {
  const liveTables = await pool.query(
    `SELECT table_schema, table_name, table_type
     FROM information_schema.tables
     WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
       AND table_type = 'BASE TABLE'
     ORDER BY table_schema, table_name`
  );

  const duplicateNames = await pool.query(
    `SELECT table_name, COUNT(*)::int AS copies, array_agg(table_schema ORDER BY table_schema) AS schemas
     FROM information_schema.tables
     WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
       AND table_type = 'BASE TABLE'
     GROUP BY table_name
     HAVING COUNT(*) > 1
     ORDER BY table_name`
  );

  const migrations = await inspectMigrationFiles();
  const liveNames = new Set(liveTables.rows.map(r => r.table_name));
  const declaredNames = new Set(migrations.declaredTables.map(t => t.table));

  const audit = {
    live: {
      tableCount: liveTables.rows.length,
      tables: liveTables.rows,
      duplicateTableNamesAcrossSchemas: duplicateNames.rows,
    },
    migrations: {
      duplicateMigrationNumbers: migrations.duplicateMigrationNumbers,
      declaredTables: migrations.declaredTables,
      files: migrations.files,
    },
    drift: {
      declaredButMissingLive: [...declaredNames].filter(name => !liveNames.has(name)).sort(),
      liveButNotDeclaredInMigrations: [...liveNames].filter(name => !declaredNames.has(name)).sort(),
    },
  };

  if (includeCounts) {
    const counts = [];
    for (const table of liveTables.rows) {
      const res = await pool.query(
        `SELECT reltuples::bigint AS approximate_rows
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = $1 AND c.relname = $2`,
        [table.table_schema, table.table_name]
      );
      counts.push({
        table: `${table.table_schema}.${table.table_name}`,
        approximateRows: res.rows[0]?.approximate_rows ?? null,
      });
    }
    audit.live.approximateRowCounts = counts;
  }

  return audit;
}

async function inspectMigrationFiles() {
  const dockerDir = path.join(process.cwd(), 'docker');
  const names = await fs.readdir(dockerDir);
  const sqlFiles = names.filter(name => name.endsWith('.sql')).sort();
  const files = [];
  const numbers = new Map();
  const declaredTables = [];

  for (const name of sqlFiles) {
    const fullPath = path.join(dockerDir, name);
    const text = await fs.readFile(fullPath, 'utf8');
    const number = name.match(/^(\d+)/)?.[1] || null;
    if (number) {
      if (!numbers.has(number)) numbers.set(number, []);
      numbers.get(number).push(name);
    }

    const creates = [...text.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(?:"?([a-zA-Z_][\w]*)"?\.)?)"?([a-zA-Z_][\w]*)"?/gi)]
      .map(match => ({
        schema: match[1] || 'public',
        table: match[2],
        file: `docker/${name}`,
      }));
    declaredTables.push(...creates);
    files.push({ file: `docker/${name}`, number, creates: creates.map(t => `${t.schema}.${t.table}`) });
  }

  return {
    files,
    declaredTables,
    duplicateMigrationNumbers: [...numbers.entries()]
      .filter(([, group]) => group.length > 1)
      .map(([number, group]) => ({ number, files: group.map(name => `docker/${name}`) })),
  };
}
