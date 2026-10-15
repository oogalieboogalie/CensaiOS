import express from 'express';
import fs from 'fs';
import pool from '../db.js';
import { resolveGithubToken } from '../github/mergeDesk.js';
import { validateProjectPath } from './files/pathUtils.js';
import { projectStatus, saveVersion, startVersions } from '../projectGit/git.js';
import { sendToGithub } from '../projectGit/publish.js';
import { createNewProject } from '../projectGit/newProject.js';

/**
 * Versions for a project folder, from the Files window. Mounted behind
 * requireLocalFilesystem.
 *
 * POST /api/project-git/new          { name }           new empty project folder
 * GET  /api/project-git/status?path=                    changes + saved versions
 * POST /api/project-git/start        { path }           turn version saving on
 * POST /api/project-git/save         { path, message }  save a version
 * POST /api/project-git/send         { path, title, body }  to GitHub / pull request
 *
 * Only folders open on this board are accepted.
 */
export const projectGitRouter = express.Router();

async function author(req) {
  const email = String(req.session?.userEmail || '');
  let name = email ? email.split('@')[0] : 'censaiOS';
  if (req.session?.userId) {
    try {
      const { rows } = await pool.query('SELECT name, email FROM users WHERE id = $1', [req.session.userId]);
      if (rows[0]?.name) name = rows[0].name;
      return { name, email: rows[0]?.email || email };
    } catch { /* keep the session's email */ }
  }
  return { name, email };
}

async function folderFor(raw) {
  const asked = String(raw || '').trim();
  if (!asked) throw Object.assign(new Error('Open a project folder first.'), { status: 400 });
  let cwd;
  try {
    cwd = await validateProjectPath(asked);
  } catch {
    throw Object.assign(new Error(`${asked} isn't a project open on this board.`), { status: 403 });
  }
  const stat = await fs.promises.stat(cwd).catch(() => null);
  if (!stat?.isDirectory()) throw Object.assign(new Error(`This folder doesn't exist: ${raw}`), { status: 404 });
  return cwd;
}

const handle = (fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (err) {
    res.status(err.status || err.statusCode || 500).json({ error: err.message });
  }
};

projectGitRouter.post('/new', handle(async (req) => createNewProject({ name: req.body?.name, author: await author(req) })));
projectGitRouter.get('/status', handle(async (req) => projectStatus(await folderFor(req.query.path))));
projectGitRouter.post('/start', handle(async (req) => startVersions(await folderFor(req.body?.path), { author: await author(req) })));
projectGitRouter.post('/save', handle(async (req) => saveVersion(await folderFor(req.body?.path), {
  message: req.body?.message, author: await author(req),
})));
projectGitRouter.post('/send', handle(async (req) => {
  const cwd = await folderFor(req.body?.path);
  const { token } = await resolveGithubToken(req.session?.userId);
  return sendToGithub(cwd, { token, title: req.body?.title, body: req.body?.body, author: await author(req) });
}));
