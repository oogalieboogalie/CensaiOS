import pool from '../db.js';
import { saveDefinitionIds } from './selection.js';
import { filterReviewedMindsets, isReviewedMindsetDefinition, REVIEWED_MINDSET_IDS } from './reviewedMindsetSources.js';
import { FAMILY_AGENT_BY_ID } from '../../src/data/family-agents.js';

function isMissingRegistryError(err) {
  return err?.code === '42P01' || err?.code === '42703';
}

function normalizeDefinition(row) {
  const value = row.value ?? row.default_value;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    value,
    default_value: value,
    type: row.type || 'attribute',
    category: row.category || null,
    validation: row.validation || {},
  };
}

export async function listAttributeDefinitions() {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, description, default_value AS value, type, category, validation
       FROM attribute_definitions
       WHERE is_active = TRUE AND type = 'attribute'
       ORDER BY sort_order, name`
    );
    return rows.map(normalizeDefinition);
  } catch (err) {
    if (!isMissingRegistryError(err)) throw err;
    const { rows } = await pool.query(
      `SELECT id, name, description, value, 'attribute' AS type, NULL AS category, '{}'::jsonb AS validation
       FROM attributes
       ORDER BY name`
    );
    return rows.map(normalizeDefinition);
  }
}

export async function listMindsetDefinitions() {
  const { rows } = await pool.query(
    `SELECT id, name, description, default_value AS value, type, category, validation
     FROM attribute_definitions
     WHERE is_active = TRUE AND type = 'mindset'
       AND id = ANY($1::text[])
     ORDER BY sort_order, name`,
    [REVIEWED_MINDSET_IDS],
  );
  return filterReviewedMindsets(rows).map(normalizeDefinition);
}

function equipmentWorkspaceId(scope = {}) {
  return String(scope.workspaceId || '').trim();
}

function canLoadEquipment(agentId, workspaceId) {
  return Boolean(workspaceId && FAMILY_AGENT_BY_ID[String(agentId || '').trim().toLowerCase()]);
}

export async function loadAgentEquippedDefinitions(agentId, scope = {}) {
  const workspaceId = equipmentWorkspaceId(scope);
  if (!canLoadEquipment(agentId, workspaceId)) return [];
  const { rows } = await pool.query(
    `SELECT d.id, d.name, d.description, d.default_value AS value, d.type, d.category, d.validation
     FROM attribute_definitions d
     JOIN workspace_agent_equipped_items e ON e.definition_id = d.id
     WHERE e.agent_id = $1 AND e.workspace_id = $2 AND d.is_active = TRUE
       AND (d.type <> 'mindset' OR d.id = ANY($3::text[]))
     ORDER BY d.type, d.sort_order, d.name`,
    [String(agentId).trim().toLowerCase(), workspaceId, REVIEWED_MINDSET_IDS]
  );
  return rows.filter(row => row.type !== 'mindset' || isReviewedMindsetDefinition(row)).map(normalizeDefinition);
}

async function loadEquippedIds(agentId, scope, type) {
  const workspaceId = equipmentWorkspaceId(scope);
  if (!canLoadEquipment(agentId, workspaceId)) return [];
  const reviewFilter = type === 'mindset'
    ? 'AND d.id = ANY($4::text[])'
    : '';
  const params = [String(agentId).trim().toLowerCase(), workspaceId, type];
  if (type === 'mindset') params.push(REVIEWED_MINDSET_IDS);
  const { rows } = await pool.query(
    `SELECT d.id,d.type,d.validation FROM attribute_definitions d
     JOIN workspace_agent_equipped_items e ON e.definition_id = d.id
     WHERE e.agent_id = $1 AND e.workspace_id = $2
       AND d.is_active = TRUE AND d.type = $3 ${reviewFilter}
     ORDER BY d.sort_order, d.name`,
    params
  );
  const reviewedRows = type === 'mindset' ? filterReviewedMindsets(rows) : rows;
  return reviewedRows.map(row => row.id);
}

export function loadAgentEquippedAttributeIds(agentId, scope = {}) {
  return loadEquippedIds(agentId, scope, 'attribute');
}

export function loadAgentEquippedMindsetIds(agentId, scope = {}) {
  return loadEquippedIds(agentId, scope, 'mindset');
}

export async function loadAttributeValuesByIds(attributeIds) {
  if (attributeIds.length === 0) return {};

  try {
    const { rows } = await pool.query(
      `SELECT id, default_value AS value
       FROM attribute_definitions
       WHERE id = ANY($1)
         AND is_active = TRUE
         AND type = 'attribute'`,
      [attributeIds]
    );
    return Object.fromEntries(rows.map((row) => [row.id, row.value]));
  } catch (err) {
    if (!isMissingRegistryError(err)) throw err;
    const { rows } = await pool.query(
      'SELECT id, value FROM attributes WHERE id = ANY($1)',
      [attributeIds]
    );
    return Object.fromEntries(rows.map((row) => [row.id, row.value]));
  }
}

export async function saveAgentAttributeIds(agentId, attributeIds, scope) {
  return saveDefinitionIds(pool, agentId, attributeIds, 'attribute', scope);
}

export async function saveAgentMindsetIds(agentId, mindsetIds, scope) {
  return saveDefinitionIds(pool, agentId, mindsetIds, 'mindset', scope);
}
