import express from 'express';
import pool from '../../db.js';
import { requireDb } from './shared.js';
import { requireWorkspaceMember } from '../../workspaces/context.js';
import {
  deleteBlueprint, getBlueprint, getBlueprintPhrases, listBlueprints, saveBlueprint, saveBlueprintPhrases, searchBlueprints,
} from '../../blueprints/store.js';
import { DEFAULT_BLUEPRINT_PHRASES } from '../../../src/lib/blueprints/blueprintPhrases.js';

// Blueprints (diagram 08): the board's shelf of named recipes with
// IDs, searched with the board's "Do we have ..." phrases.
export const blueprintsRouter = express.Router();

const EDIT_ROLES = ['owner', 'admin', 'member'];

async function scopeFor(req, roles) {
  const userId = Number(req.session?.userId);
  if (!Number.isInteger(userId) || userId <= 0) throw Object.assign(new Error('Sign in first.'), { statusCode: 401 });
  const workspaceId = String(req.query?.workspaceId || req.body?.workspaceId || '').trim();
  if (!workspaceId) throw Object.assign(new Error('Open a workspace first.'), { statusCode: 400 });
  const workspace = await requireWorkspaceMember(pool, { userId, workspaceId, ...(roles ? { roles } : {}) });
  return { userId, workspaceId: workspace.id };
}

function fail(res, error) {
  const status = Number(error?.statusCode || error?.status);
  if (Number.isInteger(status) && status >= 400 && status < 600) {
    return res.status(status).json({ error: error.message, code: error.code });
  }
  return res.status(500).json({ error: 'Blueprints are not available right now.' });
}

blueprintsRouter.get('/blueprints', requireDb, async (req, res) => {
  try {
    const scope = await scopeFor(req);
    const q = String(req.query?.q || '').trim().slice(0, 300);
    if (q) return res.json(await searchBlueprints(pool, scope.workspaceId, q, { limit: 50 }));
    return res.json({ blueprints: await listBlueprints(pool, scope.workspaceId, { shelf: req.query?.shelf || null }) });
  } catch (error) { return fail(res, error); }
});

blueprintsRouter.post('/blueprints', requireDb, async (req, res) => {
  try {
    const scope = await scopeFor(req, EDIT_ROLES);
    const blueprint = await saveBlueprint(pool, scope.workspaceId, req.body?.blueprint || {}, {
      kind: 'person', id: String(scope.userId), userId: scope.userId,
    });
    res.json({ blueprint });
  } catch (error) { fail(res, error); }
});

blueprintsRouter.get('/blueprints/phrases', requireDb, async (req, res) => {
  try {
    const scope = await scopeFor(req);
    res.json({ phrases: await getBlueprintPhrases(pool, scope.workspaceId), defaults: DEFAULT_BLUEPRINT_PHRASES });
  } catch (error) { fail(res, error); }
});

blueprintsRouter.put('/blueprints/phrases', requireDb, async (req, res) => {
  try {
    const scope = await scopeFor(req, EDIT_ROLES);
    res.json({ phrases: await saveBlueprintPhrases(pool, scope.workspaceId, req.body?.phrases) });
  } catch (error) { fail(res, error); }
});

blueprintsRouter.get('/blueprints/:blueprintId', requireDb, async (req, res) => {
  try {
    const scope = await scopeFor(req);
    const blueprint = await getBlueprint(pool, scope.workspaceId, req.params.blueprintId);
    if (!blueprint) return res.status(404).json({ error: 'That blueprint is not on this board\'s shelf.' });
    return res.json({ blueprint });
  } catch (error) { return fail(res, error); }
});

blueprintsRouter.delete('/blueprints/:blueprintId', requireDb, async (req, res) => {
  try {
    const scope = await scopeFor(req, EDIT_ROLES);
    res.json({ ok: await deleteBlueprint(pool, scope.workspaceId, req.params.blueprintId) });
  } catch (error) { fail(res, error); }
});
