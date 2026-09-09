import pool from '../db.js';
import { inspectEquipmentTenancySchema } from './tenancySchema.js';

export async function getEquipmentOwnershipSummary(db = pool) {
  const schema = await inspectEquipmentTenancySchema(db);
  if (!schema.ready) {
    return {
      ready: false,
      schema,
      legacyQuarantinedCount: null,
      legacyUnifiedCount: null,
      legacyAttributeCount: null,
      scopedCount: null,
      scopedWorkspaceCount: null,
      scopedAgentCount: null,
    };
  }

  const { rows } = await db.query(`SELECT
    (SELECT count(*)::int FROM agent_equipped_items) AS legacy_unified,
    (SELECT count(*)::int FROM agent_attributes) AS legacy_attributes,
    (SELECT count(*)::int FROM workspace_agent_equipped_items) AS scoped,
    (SELECT count(DISTINCT workspace_id)::int FROM workspace_agent_equipped_items) AS scoped_workspaces,
    (SELECT count(DISTINCT agent_id)::int FROM workspace_agent_equipped_items) AS scoped_agents`);
  const row = rows[0] || {};
  const legacyUnifiedCount = row.legacy_unified || 0;
  const legacyAttributeCount = row.legacy_attributes || 0;
  return {
    ready: true,
    legacyQuarantinedCount: legacyUnifiedCount + legacyAttributeCount,
    legacyUnifiedCount,
    legacyAttributeCount,
    scopedCount: row.scoped || 0,
    scopedWorkspaceCount: row.scoped_workspaces || 0,
    scopedAgentCount: row.scoped_agents || 0,
  };
}
