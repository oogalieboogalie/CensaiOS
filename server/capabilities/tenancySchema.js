const TABLE = 'workspace_agent_capabilities';
const REQUIRED_COLUMNS = [
  'workspace_id', 'agent_id', 'module_id', 'capability_id', 'mode', 'equipped_slot',
  'source', 'equipped_by_user_id', 'created_at', 'updated_at',
];

export async function inspectCapabilityTenancySchema(db) {
  const { rows: [presence] } = await db.query(
    "SELECT to_regclass('public.workspace_agent_capabilities') IS NOT NULL AS present",
  );
  if (!presence?.present) return { ready: false, present: false, table: TABLE, columns: [], constraints: [] };
  const [columnResult, constraintResult] = await Promise.all([
    db.query(`SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [TABLE]),
    db.query(`SELECT constraint_name,constraint_type FROM information_schema.table_constraints
      WHERE table_schema='public' AND table_name=$1 ORDER BY constraint_name`, [TABLE]),
  ]);
  const columns = columnResult.rows.map(row => row.column_name);
  const constraints = constraintResult.rows.map(row => `${row.constraint_type}:${row.constraint_name}`);
  return {
    ready: REQUIRED_COLUMNS.every(column => columns.includes(column))
      && constraints.some(value => value.startsWith('PRIMARY KEY:'))
      && constraints.filter(value => value.startsWith('FOREIGN KEY:')).length === 3,
    present: true,
    table: TABLE,
    columns,
    constraints,
  };
}
