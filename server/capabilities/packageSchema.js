import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SQL_PATH = path.resolve(here, '../../docker/042-workspace-tool-package-installs.sql');
const TABLE = 'workspace_tool_package_installs';
const REQUIRED_COLUMNS = [
  'workspace_id', 'package_id', 'module_id', 'package_version', 'manifest_hash',
  'installed_by_user_id', 'installed_at',
];

export async function ensureToolPackageSchema(db) {
  await db.query(await fs.promises.readFile(SQL_PATH, 'utf8'));
}

export async function inspectToolPackageSchema(db) {
  const { rows: [presence] } = await db.query(
    "SELECT to_regclass('public.workspace_tool_package_installs') IS NOT NULL AS present",
  );
  if (!presence?.present) return { ready: false, present: false, table: TABLE, columns: [], constraints: [] };
  const [columns, constraints] = await Promise.all([
    db.query(`SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [TABLE]),
    db.query(`SELECT constraint_name,constraint_type FROM information_schema.table_constraints
      WHERE table_schema='public' AND table_name=$1 ORDER BY constraint_name`, [TABLE]),
  ]);
  const names = columns.rows.map(row => row.column_name);
  const rules = constraints.rows.map(row => `${row.constraint_type}:${row.constraint_name}`);
  return {
    ready: REQUIRED_COLUMNS.every(column => names.includes(column))
      && rules.some(value => value.startsWith('PRIMARY KEY:'))
      && rules.some(value => value.startsWith('UNIQUE:'))
      && rules.filter(value => value.startsWith('FOREIGN KEY:')).length === 2,
    present: true, table: TABLE, columns: names, constraints: rules,
  };
}

export const __test__ = { SQL_PATH, REQUIRED_COLUMNS };
