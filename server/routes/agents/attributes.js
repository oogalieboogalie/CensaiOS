import express from 'express';
import { requireDb } from './shared.js';
import { mindsetsRouter } from './mindsets.js';
import { familyEquipmentRecipesRouter } from './familyEquipmentRecipes.js';
import { resolveConfigurationScope } from './configurationScope.js';
import { sendConfigurationError } from './configurationErrors.js';
import {
  listAttributeDefinitions,
  loadAgentEquippedAttributeIds,
  loadAttributeValuesByIds,
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
    const { compilePromptTemplate } = await import('../../memory/promptCompiler.js');
    const template = req.body?.template || '';
    const attributeIds = req.body?.attributes || [];

    const attrMap = await loadAttributeValuesByIds(attributeIds);

    const compiled = compilePromptTemplate(template, attrMap);
    res.json({ compiled, workspaceId: scope.workspaceId });
  } catch (err) {
    sendConfigurationError(res, err);
  }
});

attributesRouter.use(mindsetsRouter);
attributesRouter.use(familyEquipmentRecipesRouter);
