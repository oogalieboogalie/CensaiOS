import pool from '../db.js';
import { inspectToolApprovalSchema } from './tenancySchema.js';

export async function getToolApprovalOwnershipSummary(db = pool) {
  const schema = await inspectToolApprovalSchema(db);
  if (!schema.ready) return {
    ready: false, schema, totalCount: null, pendingCount: null,
    executingCount: null, staleExecutingCount: null,
  };
  const { rows: [row] } = await db.query(`SELECT
    count(*)::int AS total,
    count(*) FILTER (WHERE status='pending')::int AS pending,
    count(*) FILTER (WHERE status='executing')::int AS executing,
    count(*) FILTER (WHERE status='executing' AND execution_started_at < NOW()-INTERVAL '5 minutes')::int AS stale
    FROM workspace_tool_approvals`);
  return {
    ready: true,
    totalCount: row?.total || 0,
    pendingCount: row?.pending || 0,
    executingCount: row?.executing || 0,
    staleExecutingCount: row?.stale || 0,
  };
}
