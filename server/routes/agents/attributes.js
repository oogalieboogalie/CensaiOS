import express from 'express';
import pool from '../../db.js';
import { requireDb } from './shared.js';
import { mindsetsRouter } from './mindsets.js';
import { familyEquipmentRecipesRouter } from './familyEquipmentRecipes.js';
import { resolveConfigurationScope } from './configurationScope.js';
import { sendConfigurationError } from './configurationErrors.js';
import {
  listAttributeDefinitions,
  loadAgentEquippedAttributeIds,
  loadDefinitionsByIds,
  saveAgentAttributeIds,
} from '../../attributes/registry.js';

export const attributesRouter = express.Router();

/**
 * @route GET /api/attributes
 * @returns {object} List of all available trait definitions.
 */
attributesRouter.get('/attributes', requireDb, async (req, res) => {
  try {
    const attributes = await listAttributeDefinitions();
    res.json({ attributes });
  } catch (err) {
    sendConfigurationError(res, err);
  }
});

/**
 * @route GET /api/agents/:id/attributes
 * @returns {object} Array of equipped attribute IDs.
 */
attributesRouter.get('/agents/:id/attributes', requireDb, async (req, res) => {
  try {
    const scope = await resolveConfigurationScope(req);
    const attributes = await loadAgentEquippedAttributeIds(scope.agentId, scope);
    res.json({ attributes, workspaceId: scope.workspaceId });
  } catch (err) {
    sendConfigurationError(res, err);
  }
});

/**
 * @route PUT /api/agents/:id/attributes
 * @param {object} req.body Equipped attribute IDs payload.
 * @returns {object} Status indicating success.
 */
attributesRouter.put('/agents/:id/attributes', requireDb, async (req, res) => {
  const attributeIds = req.body?.attributes || [];

  try {
    const scope = await resolveConfigurationScope(req, { write: true });
    await saveAgentAttributeIds(scope.agentId, attributeIds, scope);
    res.json({ ok: true, workspaceId: scope.workspaceId });
  } catch (err) {
    sendConfigurationError(res, err);
  }
});

/**
 * @route POST /api/agents/:id/compile-prompt-preview
 * @param {object} req.body Template string and active attributes.
 * @returns {object} The compiled template.
 */
attributesRouter.post('/agents/:id/compile-prompt-preview', requireDb, async (req, res) => {
  try {
    const scope = await resolveConfigurationScope(req);
    const {
      buildOperatingAttributesPrompt,
      buildOperatingMindsetsPrompt,
      compilePromptTemplate,
    } = await import('../../memory/promptCompiler.js');
    const { buildFamilyBlueprintPrompt } = await import('../../agents/familyBlueprint.js');
    // Same order as the real chat prompt (server/memory/prompt.js), so the
    // preview shows exactly what the agent will be told.
    const template = buildFamilyBlueprintPrompt(scope.agentId) || String(req.body?.template || '');
    const ids = (value) => (Array.isArray(value) ? value : []);
    const definitions = await loadDefinitionsByIds([
      ...ids(req.body?.attributes), ...ids(req.body?.mindsets),
    ]);
    const attributes = definitions.filter(definition => definition.type !== 'mindset');
    const mindsets = definitions.filter(definition => definition.type === 'mindset');
    const attrMap = Object.fromEntries(attributes.map(definition => [definition.id, definition.value]));
    const { loadEquippedSkillSets } = await import('../../skillSets/store.js');
    const { buildSkillSetsPrompt } = await import('../../skillSets/normalize.js');
    const skillSets = await loadEquippedSkillSets(pool, scope.workspaceId, scope.agentId).catch(() => []);
    const compiled = compilePromptTemplate(template, attrMap)
      + buildOperatingAttributesPrompt(attributes)
      + buildOperatingMindsetsPrompt(mindsets)
      + buildSkillSetsPrompt(skillSets);
    res.json({ compiled, template, workspaceId: scope.workspaceId });
  } catch (err) {
    sendConfigurationError(res, err);
  }
});

attributesRouter.use(mindsetsRouter);
attributesRouter.use(familyEquipmentRecipesRouter);
