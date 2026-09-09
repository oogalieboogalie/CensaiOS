import express from 'express';
import pool from '../../db.js';
import { applyFamilyEquipmentRecipe, FamilyRecipeError, listFamilyEquipmentRecipes } from '../../attributes/familyRecipes.js';
import { requireWorkspaceMember } from '../../workspaces/context.js';
import { requireDb } from './shared.js';
import { sendConfigurationError } from './configurationErrors.js';

export const familyEquipmentRecipesRouter = express.Router();

function routeError(message, statusCode, code) {
  return Object.assign(new Error(message), { statusCode, code });
}

function requestedWorkspaceId(req) {
  const values = [
    req.query?.workspaceId,
    req.query?.workspace_id,
    req.body?.workspaceId,
    req.body?.workspace_id,
  ].map(value => String(value ?? '').trim()).filter(Boolean);
  const unique = [...new Set(values)];
  if (unique.length > 1) throw routeError('Conflicting workspace IDs are not allowed.', 400, 'FAMILY_RECIPE_SCOPE_CONFLICT');
  if (!unique[0]) throw routeError('Open a workspace to configure the family.', 400, 'FAMILY_RECIPE_SCOPE_REQUIRED');
  return unique[0];
}

async function resolveScope(req, { write = false } = {}) {
  const userId = Number(req.session?.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw routeError('Authentication is required.', 401, 'AUTHENTICATION_REQUIRED');
  }
  const workspaceId = requestedWorkspaceId(req);
  const workspace = await requireWorkspaceMember(pool, {
    userId,
    workspaceId,
    ...(write ? { roles: ['owner', 'admin'] } : {}),
  });
  return { userId, workspaceId: workspace.id, role: workspace.role };
}

function sendError(res, error) {
  if (error instanceof FamilyRecipeError && !error.statusCode) error.statusCode = 400;
  return sendConfigurationError(res, error, 'Family equipment is temporarily unavailable.');
}

familyEquipmentRecipesRouter.get('/family/equipment-recipes', requireDb, async (req, res) => {
  try {
    const scope = await resolveScope(req);
    const recipes = await listFamilyEquipmentRecipes(pool, scope.workspaceId);
    res.json({ recipes, workspaceId: scope.workspaceId });
  } catch (error) {
    sendError(res, error);
  }
});

familyEquipmentRecipesRouter.post('/family/equipment-recipes/:recipeId/apply', requireDb, async (req, res) => {
  try {
    const scope = await resolveScope(req, { write: true });
    const result = await applyFamilyEquipmentRecipe(pool, {
      workspaceId: scope.workspaceId,
      userId: scope.userId,
      recipeId: req.params.recipeId,
      expectedHash: req.body?.expectedHash,
      confirmReplace: req.body?.confirmReplace,
    });
    res.json({ ok: true, workspaceId: scope.workspaceId, ...result });
  } catch (error) {
    sendError(res, error);
  }
});
