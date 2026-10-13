import pool from '../db.js';
import { inspectCapabilityTenancySchema } from './tenancySchema.js';

export async function getCapabilityOwnershipSummary(db = pool) {
  const schema = await inspectCapabilityTenancySchema(db);
  if (!schema.ready) return {
    ready: false,
    schema,
    legacyQuarantinedCount: null,
    scopedCount: null,
    scopedWorkspaceCount: null,
    scopedAgentCount: null,
  };
  const { rows: [row] } = await db.query(`SELECT
    (SELECT count(*)::int FROM agent_capabilities) AS legacy,
    (SELECT count(*)::int FROM workspace_agent_capabilities) AS scoped,
    (SELECT count(DISTINCT workspace_id)::int FROM workspace_agent_capabilities) AS scoped_workspaces,
    (SELECT count(DISTINCT agent_id)::int FROM workspace_agent_capabilities) AS scoped_agents`);
  return {
    ready: true,
    legacyQuarantinedCount: row?.legacy || 0,
    scopedCount: row?.scoped || 0,
    scopedWorkspaceCount: row?.scoped_workspaces || 0,
    scopedAgentCount: row?.scoped_agents || 0,
  };
}
