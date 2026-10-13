// server/routes/agentScout.js
//
// The Scout panel's side of scout agents (behind the session guard): which
// model an agent's scout runs on for this person, the projects it can map,
// a fresh map of one of them, and "where do I change X?" tried by hand.

import express from 'express';
import pool from '../db.js';
import { dbReady } from '../dbState.js';
import { requireWorkspaceMember } from '../workspaces/context.js';
import { listWorkspaceAgentProjects } from '../workspaces/projectMemberships.js';
import { mapStats } from '../repoScout/map.js';
import { describeFile, normalizeRelPath, overview } from '../repoScout/query.js';
import {
  keyProvidersFor, resolveScoutModel, saveScoutSetting, scoutModelChoices,
} from '../repoScout/settings.js';
import { scoutFind, scoutMapFor } from '../repoScout/service.js';

const AGENT_ID = /^[A-Za-z0-9._-]{1,64}$/;

export function createAgentScoutRouter({ db = pool, isReady = dbReady, deps = {} } = {}) {
  const router = express.Router();
  const mapFor = deps.mapFor || scoutMapFor;
  const listProjects = deps.listProjects || listWorkspaceAgentProjects;

  router.use((req, res, next) => {
    if (!isReady()) return res.status(503).json({ error: 'The database is not ready yet.' });
    if (!req.session?.userId) return res.status(401).json({ error: 'Sign in first.' });
    const agentId = String(req.query.agentId || '');
    if (!AGENT_ID.test(agentId)) return res.status(400).json({ error: 'Pick an agent first.' });
    req.scout = { userId: req.session.userId, agentId, workspaceId: String(req.query.workspaceId || '') || null };
    return next();
  });

  const fail = (res, error) => res.status(error.statusCode || 500).json({
    error: error.statusCode ? error.message : 'Something went wrong.',
  });

  async function projects(scope) {
    if (!scope.workspaceId) return [];
    // Snippets of the code come back, so board viewers do not get them.
    await requireWorkspaceMember(db, { ...scope, roles: ['owner', 'admin', 'member'] });
    const rows = await listProjects(db, { workspaceId: scope.workspaceId, agentId: scope.agentId });
    const seen = new Set();
    return rows.filter((row) => !seen.has(row.project_id) && seen.add(row.project_id)).map((row) => ({
      id: row.project_id, name: row.project_name, path: row.project_path || null,
      repo: row.project_repo || null, mappable: Boolean(row.project_path),
    }));
  }

  async function projectFor(scope, projectId) {
    const project = (await projects(scope)).find((p) => p.id === String(projectId || ''));
    if (!project) throw Object.assign(new Error(`That project is not open for this agent on this board.`), { statusCode: 404 });
    return project;
  }

  async function snapshot(scope) {
    const [model, keys, list] = await Promise.all([
      resolveScoutModel(scope, { db }),
      keyProvidersFor(scope.userId, db),
      projects(scope),
    ]);
    return { model, choices: scoutModelChoices(keys), projects: list };
  }

  router.get('/', async (req, res) => {
    try { res.json(await snapshot(req.scout)); } catch (error) { fail(res, error); }
  });

  router.put('/model', async (req, res) => {
    try {
      const { provider = null, model = null } = req.body || {};
      await saveScoutSetting(db, { ...req.scout, provider, model });
      res.json(await snapshot(req.scout));
    } catch (error) { fail(res, error); }
  });

  router.post('/map', async (req, res) => {
    try {
      const project = await projectFor(req.scout, req.body?.projectId);
      const map = await mapFor(project, { force: Boolean(req.body?.fresh) });
      const rel = req.body?.path ? normalizeRelPath(map, req.body.path) : null;
      if (req.body?.path && !rel) throw Object.assign(new Error(`No file "${req.body.path}" in the map.`), { statusCode: 404 });
      res.json({ project, stats: mapStats(map), ...overview(map), file: rel ? describeFile(map, rel) : null });
    } catch (error) { fail(res, error); }
  });

  router.post('/find', async (req, res) => {
    try {
      const project = await projectFor(req.scout, req.body?.projectId);
      const change = String(req.body?.change || '').trim().slice(0, 600);
      if (!change) throw Object.assign(new Error('Say what should change.'), { statusCode: 400 });
      res.json({ project, result: await scoutFind({ ...req.scout, project, request: change }, deps.find || {}) });
    } catch (error) { fail(res, error); }
  });

  return router;
}

export const agentScoutRouter = createAgentScoutRouter();
