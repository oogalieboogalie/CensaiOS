import pool from '../db.js';
import { requireAutonomyOwnership } from '../autonomy/ownership.js';

const STATUSES = ['new', 'contacted', 'qualified', 'dead'];

/** Turn grouped status rows into button counts for the whole board. */
export function countsFromRows(rows) {
  const counts = { all: 0, new: 0, contacted: 0, qualified: 0, dead: 0 };
  for (const row of rows || []) {
    const n = Number(row.n) || 0;
    counts.all += n;
    if (STATUSES.includes(row.status)) counts[row.status] += n;
  }
  return counts;
}

/** How many leads the board has in each status. Ignores the list filter. */
export async function countLeadStatuses(opts = {}) {
  const ownership = requireAutonomyOwnership(opts);
  const { rows } = await pool.query(
    `SELECT status, COUNT(*)::int AS n FROM sales_leads WHERE workspace_id = $1 GROUP BY status`,
    [ownership.workspaceId],
  );
  return countsFromRows(rows);
}
