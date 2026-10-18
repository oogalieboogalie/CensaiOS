import express from 'express';
import pool from '../../db.js';
import { requireDb } from './shared.js';
import { resolveConfigurationScope } from './configurationScope.js';
import { requireWorkspaceMember } from '../../workspaces/context.js';
import {
  addSkillSetLog, deleteSkillSet, getEquippedSkillSetIds, getSkillSet, listSkillSetLog, listSkillSets,
  saveSkillSet, setEquippedSkillSetIds,
} from '../../skillSets/store.js';
import { researchSkillSet } from '../../skillSets/research.js';
import { skillSetResearchDeps } from '../../skillSets/deps.js';
import { getFoundrySettings, saveFoundrySettings, SURPRISE_PROFESSIONS } from '../../skillSets/foundry.js';

export const skillSetsRouter = express.Router();

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
  return res.status(500).json({ error: 'Skill sets are not available right now.' });
}

skillSetsRouter.get('/skill-sets', requireDb, async (req, res) => {
  try {
    const scope = await scopeFor(req);
    res.json({ skillSets: await listSkillSets(pool, scope.workspaceId) });
  } catch (error) { fail(res, error); }
});

skillSetsRouter.post('/skill-sets', requireDb, async (req, res) => {
  try {
    const scope = await scopeFor(req, EDIT_ROLES);
    const input = req.body?.skillSet || {};
    const isNew = !input.id || !(await getSkillSet(pool, scope.workspaceId, input.id));
    const origin = isNew ? (input.origin === 'research' ? 'research' : 'manual') : undefined;
    res.json({ skillSet: await saveSkillSet(pool, scope.workspaceId, scope.userId, input, { origin, isNew }) });
  } catch (error) { fail(res, error); }
});

skillSetsRouter.get('/skill-sets/:setId', requireDb, async (req, res) => {
  try {
    const scope = await scopeFor(req);
    const skillSet = await getSkillSet(pool, scope.workspaceId, req.params.setId);
    if (!skillSet) return res.status(404).json({ error: 'That skill set is not in this board\'s library.' });
    return res.json({ skillSet });
  } catch (error) { return fail(res, error); }
});

skillSetsRouter.delete('/skill-sets/:setId', requireDb, async (req, res) => {
  try {
    const scope = await scopeFor(req, EDIT_ROLES);
    await deleteSkillSet(pool, scope.workspaceId, req.params.setId);
    res.json({ ok: true });
  } catch (error) { fail(res, error); }
});

// Research a position into a draft skill set. Nothing is saved until the
// person presses Save, so they can edit the draft first.
skillSetsRouter.post('/skill-sets/research', requireDb, async (req, res) => {
  try {
    const scope = await scopeFor(req, EDIT_ROLES);
    const model = { modelProvider: req.body?.modelProvider || null, modelName: req.body?.modelName || null };
    const draft = await researchSkillSet(req.body?.position, await skillSetResearchDeps(scope, model));
    res.json({ draft });
  } catch (error) { fail(res, error); }
});

skillSetsRouter.get('/skill-sets/:setId/log', requireDb, async (req, res) => {
  try {
    const scope = await scopeFor(req);
    res.json({ log: await listSkillSetLog(pool, scope.workspaceId, req.params.setId) });
  } catch (error) { fail(res, error); }
});

skillSetsRouter.post('/skill-sets/:setId/log', requireDb, async (req, res) => {
  try {
    const scope = await scopeFor(req, EDIT_ROLES);
    const entry = await addSkillSetLog(pool, scope.workspaceId, {
      skillSetId: req.params.setId, outcome: req.body?.outcome, note: req.body?.note,
      authorKind: 'person', authorId: scope.userId,
    });
    res.json({ entry });
  } catch (error) { fail(res, error); }
});

skillSetsRouter.get('/agents/:id/skill-sets', requireDb, async (req, res) => {
  try {
    const scope = await resolveConfigurationScope(req);
    res.json({ skillSets: await getEquippedSkillSetIds(pool, scope.workspaceId, scope.agentId) });
  } catch (error) { fail(res, error); }
});

skillSetsRouter.put('/agents/:id/skill-sets', requireDb, async (req, res) => {
  try {
    const scope = await resolveConfigurationScope(req, { write: true });
    res.json({ skillSets: await setEquippedSkillSetIds(pool, scope.workspaceId, scope.agentId, req.body?.skillSets) });
  } catch (error) { fail(res, error); }
});

skillSetsRouter.get('/idea-foundry', requireDb, async (req, res) => {
  try {
    const scope = await scopeFor(req);
    res.json({ settings: await getFoundrySettings(pool, scope.workspaceId), surprise: SURPRISE_PROFESSIONS });
  } catch (error) { fail(res, error); }
});

skillSetsRouter.put('/idea-foundry', requireDb, async (req, res) => {
  try {
    const scope = await scopeFor(req, ['owner', 'admin']);
    res.json({ settings: await saveFoundrySettings(pool, scope.workspaceId, scope.userId, req.body || {}) });
  } catch (error) { fail(res, error); }
});
