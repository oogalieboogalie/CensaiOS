import express from 'express';
import fs from 'fs';
import path from 'path';
import { localFilesystemAllowed, requireLocalFilesystem } from '../../middleware/runtimeMode.js';
import { isComputerOwner, requireSystemAdmin } from '../../security/systemAdmin.js';
import { isSecretFileName } from '../../security/secretFiles.js';
import {
  readCurrentProject, validateProjectPath, projectPlace, projectRootContaining,
  shownPathFor, shownParentFor, folderErrorMessage, isUnseenWindowsFolder, fileReadProblem, fileWriteProblem,
} from './pathUtils.js';
import { refuseToTeammate } from './teammateFiles.js';
import { FILE_PROBLEMS, SAVE_PROBLEMS } from '../../../shared/files/fileProblems.js';
import { safeErrorCode } from '../../security/errorCode.js';
import { resolveProjectPathForRuntime } from '../../workspaces/shared.js';
import { createLogger } from '../../logger.js';
import { walkFiles, RESULT_LIMIT } from './limitedWalk.js';

const log = createLogger('files');

// The count and the time only: a folder's path names the person's files.
function logIfCapped(what, capped, started) {
  if (capped) log.info(`${what}: stopped at the first ${RESULT_LIMIT} (${Date.now() - started} ms)`);
}

export const browserRouter = express.Router();

/**
 * requireLocalFilesystem for a file a window opens or saves: its refusal
 * carries the reason the Document and Code editor say in their own words.
 * Other routes keep the plain refusal, since their windows read `reason`
 * their own way.
 */
function requireLocalFileRead(req, res, next) {
  if (!localFilesystemAllowed()) return res.status(403).json({ error: FILE_PROBLEMS.filesOff, reason: 'filesOff' });
  return requireLocalFilesystem(req, res, next);
}

function requireLocalFileWrite(req, res, next) {
  if (!localFilesystemAllowed()) return res.status(403).json({ error: SAVE_PROBLEMS.filesOff, reason: 'filesOff' });
  return requireLocalFilesystem(req, res, next);
}

const IMAGE_MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.avif': 'image/avif',
};
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

/**
 * Where a file or folder a person asked for is on this server, once it may
 * open for them: in a project open on the board, and, for a teammate, not a
 * secret file, a hidden folder or a link out of the project. ownerOnly: it
 * opens only for this computer's owner, who is asking.
 */
async function placeFor(req, asked, options) {
  const place = await projectPlace(asked);
  return { target: place.target, ownerOnly: await refuseToTeammate(req, place, options) };
}

// Search and backlinks walk the tree the asking window is rooted at (any
// project open on the board); without one they walk the board default.
async function searchRoot(req, requested) {
  if (requested) return (await placeFor(req, requested, { isFile: false })).target;
  const currentProject = await readCurrentProject();
  return currentProject?.path
    ? resolveProjectPathForRuntime(currentProject.path)
    : path.resolve(process.cwd());
}

browserRouter.get('/files/search', requireLocalFilesystem, async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Missing query' });
  try {
    const root = await searchRoot(req, req.query.path);
    const needle = String(query).toLowerCase();
    const started = Date.now();
    const { results, capped } = await walkFiles(root, (entry) => entry.name.toLowerCase().includes(needle));
    logIfCapped('search', capped, started);
    res.json({ results, capped, limit: RESULT_LIMIT });
  } catch (err) {
    res.status(err.message?.startsWith('Access denied') ? 403 : 500).json({ error: err.message });
  }
});

browserRouter.get('/files/backlinks', requireLocalFilesystem, async (req, res) => {
  const targetPath = req.query.path;
  if (!targetPath) return res.status(400).json({ error: 'Missing path' });
  try {
    const root = (await projectRootContaining(targetPath)) || await searchRoot(req);
    const targetName = path.basename(targetPath).replace(/\.md$/, '');
    const target = path.resolve(targetPath);
    const started = Date.now();
    const { results, capped } = await walkFiles(root, async (entry, fullPath) => {
      if (!entry.name.endsWith('.md') || fullPath === target) return false;
      const content = await fs.promises.readFile(fullPath, 'utf8').catch(() => '');
      return content.includes(`[[${targetName}]]`);
    });
    logIfCapped('backlinks', capped, started);
    res.json({ results, capped, limit: RESULT_LIMIT });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

browserRouter.get('/files/content', requireLocalFileRead, async (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'Missing path query parameter' });
  try {
    const { target, ownerOnly } = await placeFor(req, filePath);
    const content = await fs.promises.readFile(target, 'utf8');
    // ownerOnly: the window keeps these words on the owner's screen, off the shared board.
    res.json({ content, path: filePath, ...(ownerOnly ? { ownerOnly: true } : {}) });
  } catch (err) {
    const { status, reason, error } = fileReadProblem(err);
    if (status === 500) log.warn(`content: a file could not be read (${safeErrorCode(err) || 'no code'})`);
    res.status(status).json({ error, reason });
  }
});

browserRouter.get('/files/image', requireLocalFilesystem, async (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'Missing path query parameter' });
  try {
    const resolvedPath = (await placeFor(req, filePath)).target;
    const ext = path.extname(resolvedPath).toLowerCase();
    const mime = IMAGE_MIME_TYPES[ext];
    if (!mime) return res.status(415).json({ error: `Not a supported image type: ${ext || '(none)'}` });
    const stats = await fs.promises.stat(resolvedPath);
    if (!stats.isFile()) return res.status(400).json({ error: 'Not a file' });
    if (stats.size > MAX_IMAGE_BYTES) {
      return res.status(413).json({ error: `Image too large (${Math.round(stats.size / 1024 / 1024)}MB, max ${MAX_IMAGE_BYTES / 1024 / 1024}MB)` });
    }
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', String(stats.size));
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(resolvedPath).replace(/"/g, '')}"`);
    fs.createReadStream(resolvedPath).on('error', () => {
      if (!res.headersSent) res.status(500).json({ error: 'Failed to read image' });
      else res.end();
    }).pipe(res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(err.message?.startsWith('Access denied') ? 403 : 500).json({ error: err.message });
    }
  }
});

browserRouter.put('/files/content', requireLocalFileWrite, requireSystemAdmin, async (req, res) => {
  const { path: filePath, content, create } = req.body;
  if (!filePath || typeof content !== 'string') return res.status(400).json({ error: 'Missing path or content in body' });
  try {
    const resolvedPath = await validateProjectPath(filePath);
    // create: a new file only (Files' New file, a note a link asks for), never over one already there.
    await fs.promises.writeFile(resolvedPath, content, { encoding: 'utf8', flag: create === true ? 'wx' : 'w' });
    res.json({ ok: true, path: filePath });
  } catch (err) {
    // A refused save gets its reason in plain words (the window says it was not saved and why).
    const { status, reason, error } = fileWriteProblem(err);
    if (status >= 500) log.warn(`content: a file could not be saved (${safeErrorCode(err) || 'no code'})`);
    res.status(status).json({ error, reason });
  }
});

/**
 * The Finder's columns (details=1): when each entry last changed and, for a
 * file, its size. Read from the entry itself, so a link gives its own, never
 * what it leads to. A teammate gets only the name of a file that holds keys,
 * as Files shows it; its size and date stay the owner's.
 */
async function withDetails(req, dir, children) {
  const secret = (child) => !child.isDir && isSecretFileName(child.name);
  // When the owner check cannot be made just now, the list still comes, names only.
  const nameOnly = children.some(secret) && !(await isComputerOwner(req).catch(() => false));
  return Promise.all(children.map(async (child) => {
    if (nameOnly && secret(child)) return child;
    const stats = await fs.promises.lstat(path.join(dir, child.name)).catch(() => null);
    if (!stats) return child;
    return { ...child, modified: Math.round(stats.mtimeMs), ...(child.isDir ? {} : { size: stats.size }) };
  }));
}

async function browseFolder(req, res) {
  const dirPath = req.query.path;
  try {
    const currentProject = await readCurrentProject();
    const resolved = dirPath
      ? (await placeFor(req, dirPath, { isFile: false })).target
      : currentProject?.path
        ? resolveProjectPathForRuntime(currentProject.path)
        : path.resolve(process.cwd());
    const stats = await fs.promises.stat(resolved);
    if (!stats.isDirectory()) return res.status(400).json({ error: 'Not a directory' });
    const entries = await fs.promises.readdir(resolved, { withFileTypes: true });
    const listed = entries
      .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== '$Recycle.Bin' && e.name !== 'System Volume Information')
      .map(e => ({ name: e.name, isDir: e.isDirectory(), path: shownPathFor(dirPath, resolved, e.name) }))
      .sort((a, b) => { if (a.isDir && !b.isDir) return -1; if (!a.isDir && b.isDir) return 1; return a.name.localeCompare(b.name); });
    const children = req.query.details === '1' ? await withDetails(req, resolved, listed) : listed;
    res.json({ path: shownPathFor(dirPath, resolved), parent: shownParentFor(dirPath, resolved), children });
  } catch (err) {
    const unseen = isUnseenWindowsFolder(err, dirPath);
    const status = err.code === 'ENOENT' || unseen ? 404
      : err.message?.startsWith('Access denied') ? 403 : 500;
    // reason: the Finder says a missing folder and one outside the open projects
    // in its own words; for a folder Docker cannot see it keeps the server's,
    // which say how to share it.
    const reason = unseen ? 'unseen' : status === 404 ? 'missing' : status === 403 ? fileReadProblem(err).reason : null;
    res.status(status).json({ error: folderErrorMessage(err, dirPath) || err.message, ...(reason ? { reason } : {}) });
  }
}

browserRouter.get('/files/browse', requireLocalFilesystem, browseFolder);
// The same answer for a folder Files already shows, asked again every few
// seconds to catch changes made outside censaiOS (src/components/files/
// useCatchUp.js). The request log keeps these below info (boot/requestLog.js).
browserRouter.get('/files/relist', requireLocalFilesystem, browseFolder);
