import express from 'express';
import fs from 'fs';
import path from 'path';
import { localFilesystemAllowed, requireLocalFilesystem } from '../../middleware/runtimeMode.js';
import { requireSystemAdmin } from '../../security/systemAdmin.js';
import {
  readCurrentProject, validateProjectPath, getDirectoryTree, projectRootContaining,
  shownPathFor, shownParentFor, folderErrorMessage, isUnseenWindowsFolder, fileReadProblem,
} from './pathUtils.js';
import { FILE_PROBLEMS } from '../../../shared/files/fileProblems.js';
import { safeErrorCode } from '../../security/errorCode.js';
import { resolveProjectPathForRuntime } from '../../workspaces/shared.js';
import { createLogger } from '../../logger.js';
import { walkFiles, RESULT_LIMIT } from './limitedWalk.js';

const log = createLogger('files');

function logIfCapped(what, root, capped, started) {
  if (capped) log.info(`${what}: stopped at the first ${RESULT_LIMIT} in ${root} (${Date.now() - started} ms)`);
}

export const browserRouter = express.Router();

/**
 * requireLocalFilesystem for a file a window opens: its refusal carries the
 * reason the Document and Code editor say in their own words. Other routes
 * keep the plain refusal, since their windows read `reason` their own way.
 */
function requireLocalFileRead(req, res, next) {
  if (!localFilesystemAllowed()) return res.status(403).json({ error: FILE_PROBLEMS.filesOff, reason: 'filesOff' });
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

// Search and backlinks walk the tree the asking window is rooted at (any
// project open on the board); without one they walk the board default.
async function searchRoot(requested) {
  if (requested) return validateProjectPath(requested);
  const currentProject = await readCurrentProject();
  return currentProject?.path
    ? resolveProjectPathForRuntime(currentProject.path)
    : path.resolve(process.cwd());
}

browserRouter.get('/files', requireLocalFilesystem, async (req, res) => {
  const dirPath = req.query.path;
  if (!dirPath) return res.status(400).json({ error: 'Missing path query parameter' });
  try {
    const resolvedPath = await validateProjectPath(dirPath);
    res.json(await getDirectoryTree(resolvedPath));
  } catch (err) {
    res.status(err.message?.startsWith('Access denied') ? 403 : 500).json({ error: err.message });
  }
});

browserRouter.get('/files/search', requireLocalFilesystem, async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Missing query' });
  try {
    const root = await searchRoot(req.query.path);
    const needle = String(query).toLowerCase();
    const started = Date.now();
    const { results, capped } = await walkFiles(root, (entry) => entry.name.toLowerCase().includes(needle));
    logIfCapped('search', root, capped, started);
    res.json({ results, capped, limit: RESULT_LIMIT });
  } catch (err) {
    res.status(err.message?.startsWith('Access denied') ? 403 : 500).json({ error: err.message });
  }
});

browserRouter.get('/files/backlinks', requireLocalFilesystem, async (req, res) => {
  const targetPath = req.query.path;
  if (!targetPath) return res.status(400).json({ error: 'Missing path' });
  try {
    const root = (await projectRootContaining(targetPath)) || await searchRoot();
    const targetName = path.basename(targetPath).replace(/\.md$/, '');
    const target = path.resolve(targetPath);
    const started = Date.now();
    const { results, capped } = await walkFiles(root, async (entry, fullPath) => {
      if (!entry.name.endsWith('.md') || fullPath === target) return false;
      const content = await fs.promises.readFile(fullPath, 'utf8').catch(() => '');
      return content.includes(`[[${targetName}]]`);
    });
    logIfCapped('backlinks', root, capped, started);
    res.json({ results, capped, limit: RESULT_LIMIT });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

browserRouter.get('/files/content', requireLocalFileRead, async (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'Missing path query parameter' });
  try {
    const resolvedPath = await validateProjectPath(filePath);
    const content = await fs.promises.readFile(resolvedPath, 'utf8');
    res.json({ content, path: filePath });
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
    const resolvedPath = await validateProjectPath(filePath);
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

browserRouter.put('/files/content', requireLocalFilesystem, requireSystemAdmin, async (req, res) => {
  const { path: filePath, content } = req.body;
  if (!filePath || typeof content !== 'string') return res.status(400).json({ error: 'Missing path or content in body' });
  try {
    const resolvedPath = await validateProjectPath(filePath);
    await fs.promises.writeFile(resolvedPath, content, 'utf8');
    res.json({ ok: true, path: filePath });
  } catch (err) {
    res.status(err.message?.startsWith('Access denied') ? 403 : 500).json({ error: err.message });
  }
});

browserRouter.get('/files/browse', requireLocalFilesystem, async (req, res) => {
  const dirPath = req.query.path;
  try {
    const currentProject = await readCurrentProject();
    const resolved = dirPath
      ? await validateProjectPath(dirPath)
      : currentProject?.path
        ? resolveProjectPathForRuntime(currentProject.path)
        : path.resolve(process.cwd());
    const stats = await fs.promises.stat(resolved);
    if (!stats.isDirectory()) return res.status(400).json({ error: 'Not a directory' });
    const entries = await fs.promises.readdir(resolved, { withFileTypes: true });
    const children = entries
      .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== '$Recycle.Bin' && e.name !== 'System Volume Information')
      .map(e => ({ name: e.name, isDir: e.isDirectory(), path: shownPathFor(dirPath, resolved, e.name) }))
      .sort((a, b) => { if (a.isDir && !b.isDir) return -1; if (!a.isDir && b.isDir) return 1; return a.name.localeCompare(b.name); });
    res.json({ path: shownPathFor(dirPath, resolved), parent: shownParentFor(dirPath, resolved), children });
  } catch (err) {
    const status = err.code === 'ENOENT' || isUnseenWindowsFolder(err, dirPath) ? 404
      : err.message?.startsWith('Access denied') ? 403 : 500;
    res.status(status).json({ error: folderErrorMessage(err, dirPath) || err.message });
  }
});
