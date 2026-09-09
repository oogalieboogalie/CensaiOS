import crypto from 'node:crypto';
import { FAMILY_AGENT_BY_ID, FAMILY_AGENT_IDS } from '../../src/data/family-agents.js';
import { FAMILY_EQUIPMENT_RECIPES, getFamilyEquipmentRecipe } from '../../src/data/family-equipment-recipes.js';
import { createWorkspaceEvent } from '../operational-intelligence/factories.js';
import { isReviewedMindsetDefinition } from './reviewedMindsetSources.js';

export class FamilyRecipeError extends Error {
  constructor(message, statusCode = 400, code = 'FAMILY_RECIPE_INVALID') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

function recipeHash(recipe) {
  const contract = { id: recipe.id, version: recipe.version, sourceReport: recipe.sourceReport, agents: recipe.agents };
  return crypto.createHash('sha256').update(JSON.stringify(contract)).digest('hex');
}

function recipeRows(recipe) {
  return FAMILY_AGENT_IDS.flatMap(agentId => {
    const loadout = recipe.agents[agentId];
    if (!loadout) throw new FamilyRecipeError(`Recipe is missing ${agentId}.`, 500, 'FAMILY_RECIPE_BROKEN');
    const attributes = loadout.attributes.map(definitionId => ({ agentId, definitionId, type: 'attribute' }));
    const mindsets = loadout.mindsets.map(definitionId => ({ agentId, definitionId, type: 'mindset' }));
    return [...attributes, ...mindsets];
  });
}

function rowKey(row) {
  return `${row.agentId || row.agent_id}:${row.definitionId || row.definition_id}`;
}

function publicRecipe(recipe, currentRows) {
  const expected = recipeRows(recipe);
  const expectedKeys = new Set(expected.map(rowKey));
  const currentKeys = new Set(currentRows.map(rowKey));
  const differenceCount = [...expectedKeys].filter(key => !currentKeys.has(key)).length
    + [...currentKeys].filter(key => !expectedKeys.has(key)).length;
  return {
    ...recipe,
    hash: recipeHash(recipe),
    applied: differenceCount === 0,
    differenceCount,
    definitionCount: expected.length,
    agents: Object.fromEntries(FAMILY_AGENT_IDS.map(agentId => [agentId, {
      ...recipe.agents[agentId],
      name: FAMILY_AGENT_BY_ID[agentId].name,
      role: FAMILY_AGENT_BY_ID[agentId].role,
    }])),
  };
}

async function loadCurrent(client, workspaceId) {
  const { rows } = await client.query(
    `SELECT agent_id,definition_id FROM workspace_agent_equipped_items
      WHERE workspace_id=$1 AND agent_id=ANY($2::text[])
      ORDER BY agent_id,definition_id`,
    [workspaceId, FAMILY_AGENT_IDS],
  );
  return rows;
}

export async function listFamilyEquipmentRecipes(db, workspaceId) {
  const current = await loadCurrent(db, workspaceId);
  return FAMILY_EQUIPMENT_RECIPES.map(recipe => publicRecipe(recipe, current));
}

function validateDefinitions(rows, expectedRows) {
  const definitions = new Map(rows.map(row => [row.id, row]));
  const invalid = [];
  for (const expected of expectedRows) {
    const definition = definitions.get(expected.definitionId);
    const reviewed = expected.type !== 'mindset' || isReviewedMindsetDefinition(definition);
    if (!definition || definition.type !== expected.type || definition.is_active !== true || !reviewed) {
      invalid.push(expected.definitionId);
    }
  }
  if (invalid.length) {
    throw new FamilyRecipeError(
      `Recipe definitions are unavailable or unreviewed: ${[...new Set(invalid)].join(', ')}`,
      409,
      'FAMILY_RECIPE_DEFINITION_DRIFT',
    );
  }
}

async function replaceEquipment(client, { workspaceId, userId, rows }) {
  await client.query(
    'DELETE FROM workspace_agent_equipped_items WHERE workspace_id=$1 AND agent_id=ANY($2::text[])',
    [workspaceId, FAMILY_AGENT_IDS],
  );
  await client.query(
    `INSERT INTO workspace_agent_equipped_items
      (workspace_id,agent_id,definition_id,equipped_by_user_id,equipped_at)
     SELECT $1,input.agent_id,input.definition_id,$4,NOW()
       FROM unnest($2::text[],$3::text[]) AS input(agent_id,definition_id)`,
    [workspaceId, rows.map(row => row.agentId), rows.map(row => row.definitionId), userId],
  );
}

export async function applyFamilyEquipmentRecipe(db, {
  workspaceId,
  userId,
  recipeId,
  expectedHash,
  confirmReplace,
}) {
  const recipe = getFamilyEquipmentRecipe(recipeId);
  if (!recipe) throw new FamilyRecipeError('Family recipe not found.', 404, 'FAMILY_RECIPE_NOT_FOUND');
  const hash = recipeHash(recipe);
  if (expectedHash !== hash) {
    throw new FamilyRecipeError('The family recipe changed. Review it again before applying.', 409, 'FAMILY_RECIPE_STALE');
  }
  if (confirmReplace !== true) {
    throw new FamilyRecipeError('Confirm that this replaces all family equipment in the workspace.');
  }
  const expectedRows = recipeRows(recipe);
  const definitionIds = [...new Set(expectedRows.map(row => row.definitionId))];
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`family-recipe:${workspaceId}`]);
    const definitions = await client.query(
      'SELECT id,type,is_active,validation FROM attribute_definitions WHERE id=ANY($1::text[])',
      [definitionIds],
    );
    validateDefinitions(definitions.rows, expectedRows);
    const current = await loadCurrent(client, workspaceId);
    const preview = publicRecipe(recipe, current);
    if (preview.applied) {
      await client.query('COMMIT');
      return { changed: false, eventId: null, recipe: preview };
    }
    await replaceEquipment(client, { workspaceId, userId, rows: expectedRows });
    const event = await createWorkspaceEvent({ db: client }, {
      workspaceId,
      type: 'family.equipment.recipe_applied',
      actor: { kind: 'user', id: String(userId) },
      payload: { recipeId, recipeHash: hash, definitionCount: expectedRows.length },
    });
    await client.query('COMMIT');
    return { changed: true, eventId: event.id, recipe: publicRecipe(recipe, expectedRows) };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
