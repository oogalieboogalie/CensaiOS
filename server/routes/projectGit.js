import express from 'express';
import fs from 'fs';
import pool from '../db.js';
import { resolveGithubToken } from '../github/mergeDesk.js';
import { validateProjectPath } from './files/pathUtils.js';
import { OWN_STATE, OWN_STATE_WORDS } from './files/ownState.js';
import { projectStatus, saveVersion, startVersions } from '../projectGit/git.js';
import { sendToGithub } from '../projectGit/publish.js';
import { makeVersionsAgain } from '../projectGit/makeAgain.js';
import { createNewProject } from '../projectGit/newProject.js';
import { markNewKeys } from '../projectGit/newKeys.js';

/**
 * Versions for a project folder, from the Files window. Mounted behind
 * requireLocalFilesystem.
 *
 * POST /api/project-git/new          { name }           new empty project folder
 * GET  /api/project-git/status?path=                    changes + saved versions
 * POST /api/project-git/start        { path }           turn version saving on
 * POST /api/project-git/save         { path, message }  save a version
 * POST /api/project-git/send         { path, title, body }  to GitHub / pull request
 * POST /api/project-git/make-again   { path }           the versions GitHub does not have yet, again without key files
 * POST /api/project-git/new-keys     { path, names }    new keys made: the bar puts away those files GitHub keeps
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
  } catch (err) {
    throw Object.assign(new Error(err.code === OWN_STATE ? OWN_STATE_WORDS : `${asked} isn't a project open on this board.`), { status: 403 });
  }
  const stat = await fs.promises.stat(cwd).catch(() => null);
  if (!stat?.isDirectory()) throw Object.assign(new Error(`This folder doesn't exist: ${raw}`), { status: 404 });
  return cwd;
}

const handle = (fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (err) {
    // A send refused for files that hold keys names them (and those GitHub's versions hold) and counts the versions, so the bar can offer to make those again.
    const keptOut = Array.isArray(err.keptOut) ? { keptOut: err.keptOut, githubHas: err.githubHas || [], onMain: err.onMain || [], versions: err.versions } : {};
    res.status(err.status || err.statusCode || 500).json({ error: err.message, ...keptOut });
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
projectGitRouter.post('/make-again', handle(async (req) => {
  const cwd = await folderFor(req.body?.path);
  const { token } = await resolveGithubToken(req.session?.userId);
  return makeVersionsAgain(cwd, { token });
}));
projectGitRouter.post('/new-keys', handle(async (req) => markNewKeys(await folderFor(req.body?.path), req.body?.names)));
