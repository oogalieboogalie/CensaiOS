import pool from '../db.js';
import {
  FAMILY_BLUEPRINT_AGENT_IDS,
  FAMILY_BLUEPRINT_COUNTS,
  FAMILY_BLUEPRINT_HASH,
  FAMILY_BLUEPRINT_VERSION,
} from './familyBlueprint.js';
import { getFamilyHealingGate } from '../memory/healing/gate.js';

const LEGACY_COUNTS_SQL = `SELECT
  (SELECT count(*)::int FROM agents
    WHERE id = ANY($1::text[])) AS canonical_agent_count,
  (SELECT COALESCE(
      array_agg(required.id ORDER BY required.id) FILTER (WHERE agents.id IS NULL),
      ARRAY[]::text[])
    FROM unnest($1::text[]) AS required(id)
    LEFT JOIN agents ON agents.id = required.id) AS missing_canonical_agent_ids,
  (SELECT count(*)::int FROM family_genetics) AS legacy_genetics_count,
  (SELECT count(*)::int FROM watch_graph) AS legacy_watch_edge_count,
  (SELECT count(*)::int FROM trait_inheritance) AS legacy_inheritance_count,
  (SELECT count(*)::int FROM agents
    WHERE NOT (id = ANY($1::text[]))) AS noncanonical_agent_count,
  (SELECT count(*)::int FROM family_genetics
    WHERE NOT (agent_id = ANY($1::text[]))) AS noncanonical_genetics_count,
  (SELECT count(*)::int FROM watch_graph
    WHERE NOT (watcher = ANY($1::text[]))
       OR NOT (watching = ANY($1::text[]))) AS noncanonical_watch_edge_count,
  (SELECT count(*)::int FROM trait_inheritance
    WHERE NOT (from_agent = ANY($1::text[]))
       OR NOT (to_agent = ANY($1::text[]))) AS noncanonical_inheritance_count`;

function count(row, field) {
  return Number(row?.[field] ?? 0);
}

export async function getFamilyBoundaryStatus(db = pool, env = process.env) {
  const { rows } = await db.query(LEGACY_COUNTS_SQL, [[...FAMILY_BLUEPRINT_AGENT_IDS]]);
  const row = rows[0] || {};
  const healing = getFamilyHealingGate(env);
  const blueprintReady = FAMILY_BLUEPRINT_COUNTS.agents === 8
    && FAMILY_BLUEPRINT_COUNTS.watchEdges === 11
    && Boolean(FAMILY_BLUEPRINT_VERSION && FAMILY_BLUEPRINT_HASH);
  const canonicalAgentCount = count(row, 'canonical_agent_count');
  const missingCanonicalAgentIds = Array.isArray(row.missing_canonical_agent_ids)
    ? row.missing_canonical_agent_ids
    : [...FAMILY_BLUEPRINT_AGENT_IDS];
  const databaseReady = canonicalAgentCount === FAMILY_BLUEPRINT_COUNTS.agents
    && missingCanonicalAgentIds.length === 0;
  const ready = blueprintReady && databaseReady && healing.ready;
  return Object.freeze({
    ready,
    ...(!ready ? {
      reason: !healing.ready
        ? healing.reason
        : !blueprintReady ? 'family_blueprint_invalid' : 'canonical_family_incomplete',
    } : {}),
    blueprint: Object.freeze({
      version: FAMILY_BLUEPRINT_VERSION,
      hash: FAMILY_BLUEPRINT_HASH,
      agentCount: FAMILY_BLUEPRINT_COUNTS.agents,
      watchEdgeCount: FAMILY_BLUEPRINT_COUNTS.watchEdges,
    }),
    database: Object.freeze({
      canonicalAgentCount,
      missingCanonicalAgentIds: Object.freeze([...missingCanonicalAgentIds]),
    }),
    legacy: Object.freeze({
      geneticsCount: count(row, 'legacy_genetics_count'),
      watchEdgeCount: count(row, 'legacy_watch_edge_count'),
      inheritanceCount: count(row, 'legacy_inheritance_count'),
      noncanonicalAgentCount: count(row, 'noncanonical_agent_count'),
      noncanonicalGeneticsCount: count(row, 'noncanonical_genetics_count'),
      noncanonicalWatchEdgeCount: count(row, 'noncanonical_watch_edge_count'),
      noncanonicalInheritanceCount: count(row, 'noncanonical_inheritance_count'),
    }),
    healing,
  });
}
