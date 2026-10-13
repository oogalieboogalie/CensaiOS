import pool from '../db.js';

const TABLE = 'workspace_agent_equipped_items';
const REQUIRED_COLUMNS = Object.freeze([
  'workspace_id',
  'agent_id',
  'definition_id',
  'equipped_by_user_id',
  'equipped_at',
]);

export async function inspectEquipmentTenancySchema(db = pool) {
  const { rows: tableRows } = await db.query(
    "SELECT to_regclass('public.workspace_agent_equipped_items') IS NOT NULL AS present"
  );
  if (tableRows[0]?.present !== true) {
    return { ready: false, table: TABLE, present: false, columns: [], constraints: [] };
  }

  const [{ rows: columnRows }, { rows: constraintRows }] = await Promise.all([
    db.query(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position`,
      [TABLE]
    ),
    db.query(
      `SELECT constraint_type
         FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND table_name = $1`,
      [TABLE]
    ),
  ]);
  const columns = columnRows.map(row => row.column_name);
  const constraints = constraintRows.map(row => row.constraint_type);
  return {
    ready: REQUIRED_COLUMNS.every(column => columns.includes(column))
      && constraints.includes('PRIMARY KEY')
      && constraints.filter(type => type === 'FOREIGN KEY').length >= 4,
    table: TABLE,
    present: true,
    columns,
    constraints,
  };
}
