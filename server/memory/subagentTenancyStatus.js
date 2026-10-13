import pool from '../db.js';
import { inspectSubAgentTenancySchema } from './subagentTenancySchema.js';

export async function getSubAgentOwnershipSummary(db = pool) {
  const schema = await inspectSubAgentTenancySchema(db);
  if (!schema.ready) {
    return {
      ready: false,
      schema,
      legacyUnscopedCount: null,
      scopedCount: null,
      legacyScratchpadCount: null,
      scopedScratchpadCount: null,
    };
  }
  const { rows } = await db.query(`SELECT
    (SELECT count(*)::int FROM sub_agents WHERE workspace_id IS NULL) AS legacy_agents,
    (SELECT count(*)::int FROM sub_agents WHERE workspace_id IS NOT NULL) AS scoped_agents,
    (SELECT count(*)::int FROM sub_agent_scratchpad WHERE workspace_id IS NULL) AS legacy_scratchpad,
    (SELECT count(*)::int FROM sub_agent_scratchpad WHERE workspace_id IS NOT NULL) AS scoped_scratchpad`);
  const row = rows[0] || {};
  return {
    ready: true,
    legacyUnscopedCount: row.legacy_agents || 0,
    scopedCount: row.scoped_agents || 0,
    legacyScratchpadCount: row.legacy_scratchpad || 0,
    scopedScratchpadCount: row.scoped_scratchpad || 0,
  };
}
