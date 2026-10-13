import { jest } from '@jest/globals';
import { applyFamilyEquipmentRecipe, listFamilyEquipmentRecipes } from '../server/attributes/familyRecipes.js';
import { REVIEWED_MINDSET_SOURCES } from '../server/attributes/reviewedMindsetSources.js';
import { FAMILY_AGENT_IDS } from '../src/data/family-agents.js';
import { FAMILY_EQUIPMENT_RECIPES } from '../src/data/family-equipment-recipes.js';

const recipe = FAMILY_EQUIPMENT_RECIPES[0];

function expectedRows() {
  return FAMILY_AGENT_IDS.flatMap(agentId => [
    ...recipe.agents[agentId].attributes.map(definition_id => ({ agent_id: agentId, definition_id })),
    ...recipe.agents[agentId].mindsets.map(definition_id => ({ agent_id: agentId, definition_id })),
  ]);
}

function definitionRows({ corrupt = null } = {}) {
  const ids = [...new Set(expectedRows().map(row => row.definition_id))];
  return ids.map(id => {
    const source = REVIEWED_MINDSET_SOURCES[id];
    return {
      id,
      type: source ? 'mindset' : 'attribute',
      is_active: true,
      validation: source ? {
        source: source.source,
        source_family: source.sourceFamily,
        report: source.report,
        issues: source.issues.map(([number]) => number),
      } : {},
      ...(id === corrupt ? { validation: { issues: [999], report: 'fake.md' } } : {}),
    };
  });
}

async function recipePreview(current = []) {
  const db = { query: jest.fn().mockResolvedValue({ rows: current }) };
  return (await listFamilyEquipmentRecipes(db, 'workspace-1'))[0];
}

function recipePool({ current = [], corrupt = null } = {}) {
  const client = { release: jest.fn() };
  client.query = jest.fn(async (sql) => {
    const text = String(sql);
    if (text.includes('SELECT id,type,is_active,validation')) return { rows: definitionRows({ corrupt }) };
    if (text.includes('SELECT agent_id,definition_id')) return { rows: current };
    if (text.includes('INSERT INTO workspace_events')) return { rows: [{ id: 'event-1' }] };
    return { rows: [] };
  });
  return { pool: { connect: jest.fn().mockResolvedValue(client) }, client };
}

describe('Artisan family equipment recipe', () => {
  test('defines one complete recipe with seven distinct role signatures', () => {
    const signatures = FAMILY_AGENT_IDS.map(agentId => JSON.stringify(recipe.agents[agentId]));
    expect(Object.keys(recipe.agents)).toEqual(FAMILY_AGENT_IDS);
    expect(new Set(signatures).size).toBe(8);
    expect(expectedRows()).toHaveLength(38);
  });

  test('atomically replaces all family equipment and records signed attribution', async () => {
    const preview = await recipePreview();
    const { pool, client } = recipePool();

    const result = await applyFamilyEquipmentRecipe(pool, {
      workspaceId: 'workspace-1',
      userId: 7,
      recipeId: recipe.id,
      expectedHash: preview.hash,
      confirmReplace: true,
    });

    expect(result).toMatchObject({ changed: true, eventId: 'event-1', recipe: { applied: true } });
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM workspace_agent_equipped_items'))).toBe(true);
    const insert = client.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO workspace_agent_equipped_items'));
    expect(insert[1][0]).toBe('workspace-1');
    expect(insert[1][3]).toBe(7);
    const event = client.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO workspace_events'));
    expect(event[1].slice(0, 4)).toEqual(['workspace-1', 'family.equipment.recipe_applied', 'user', '7']);
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  test('is idempotent and emits no event for an exact match', async () => {
    const current = expectedRows();
    const preview = await recipePreview(current);
    const { pool, client } = recipePool({ current });
    const result = await applyFamilyEquipmentRecipe(pool, {
      workspaceId: 'workspace-1', userId: 7, recipeId: recipe.id,
      expectedHash: preview.hash, confirmReplace: true,
    });

    expect(result).toMatchObject({ changed: false, eventId: null });
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM'))).toBe(false);
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO workspace_events'))).toBe(false);
  });

  test('rejects stale recipes and rolls back exact-provenance drift before deletion', async () => {
    const preview = await recipePreview();
    const stale = recipePool();
    await expect(applyFamilyEquipmentRecipe(stale.pool, {
      workspaceId: 'workspace-1', userId: 7, recipeId: recipe.id,
      expectedHash: 'stale', confirmReplace: true,
    })).rejects.toMatchObject({ code: 'FAMILY_RECIPE_STALE' });
    expect(stale.pool.connect).not.toHaveBeenCalled();

    const drift = recipePool({ corrupt: 'mindset_strategic_foresight' });
    await expect(applyFamilyEquipmentRecipe(drift.pool, {
      workspaceId: 'workspace-1', userId: 7, recipeId: recipe.id,
      expectedHash: preview.hash, confirmReplace: true,
    })).rejects.toMatchObject({ code: 'FAMILY_RECIPE_DEFINITION_DRIFT' });
    expect(drift.client.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(drift.client.query.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM'))).toBe(false);
  });
});
