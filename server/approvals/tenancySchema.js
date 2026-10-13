const TABLE = 'workspace_tool_approvals';
const REQUIRED_COLUMNS = [
  'id', 'workspace_id', 'agent_id', 'module_id', 'tool_name', 'arguments', 'request_hash',
  'status', 'revision', 'requested_by_user_id', 'decided_by_user_id', 'decision_at',
  'execution_started_at', 'execution_finished_at', 'result_preview', 'error_code',
  'cancellation_reason', 'created_at', 'updated_at',
];

export async function inspectToolApprovalSchema(db) {
  const { rows: [presence] } = await db.query(
    "SELECT to_regclass('public.workspace_tool_approvals') IS NOT NULL AS present",
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
      && constraints.filter(value => value.startsWith('FOREIGN KEY:')).length === 4,
    present: true, table: TABLE, columns, constraints,
  };
}
