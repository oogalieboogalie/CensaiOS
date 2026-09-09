import express from 'express';
import fs from 'fs';
import path from 'path';
import { requireLocalFilesystem } from '../../middleware/runtimeMode.js';
import { readCurrentProject, validateProjectPath, getDirectoryTree } from './pathUtils.js';
import { resolveProjectPathForRuntime } from '../../workspaces/shared.js';

export const browserRouter = express.Router();

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
    const currentProject = await readCurrentProject();
    const root = currentProject?.path
      ? resolveProjectPathForRuntime(currentProject.path)
      : path.resolve(process.cwd());
    const results = [];
    const walk = async (dir) => {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.name.toLowerCase().includes(query.toLowerCase())) {
          results.push({ name: entry.name, path: fullPath, relativePath: path.relative(root, fullPath) });
        }
      }
    };
    await walk(root);
    res.json({ results: results.slice(0, 100) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

browserRouter.get('/files/backlinks', requireLocalFilesystem, async (req, res) => {
  const targetPath = req.query.path;
  if (!targetPath) return res.status(400).json({ error: 'Missing path' });
  try {
    const currentProject = await readCurrentProject();
    const root = currentProject?.path
      ? resolveProjectPathForRuntime(currentProject.path)
      : path.resolve(process.cwd());
    const targetName = path.basename(targetPath).replace(/\.md$/, '');
    const results = [];
    const walk = async (dir) => {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.name.endsWith('.md') && fullPath !== path.resolve(targetPath)) {
          const content = await fs.promises.readFile(fullPath, 'utf8');
          if (content.includes(`[[${targetName}]]`)) {
            results.push({ name: entry.name, path: fullPath, relativePath: path.relative(root, fullPath) });
          }
        }
      }
    };
    await walk(root);
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

browserRouter.get('/files/content', requireLocalFilesystem, async (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'Missing path query parameter' });
  try {
    const resolvedPath = await validateProjectPath(filePath);
    const content = await fs.promises.readFile(resolvedPath, 'utf8');
    res.json({ content, path: filePath });
  } catch (err) {
    res.status(err.message?.startsWith('Access denied') ? 403 : 500).json({ error: err.message });
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

browserRouter.put('/files/content', requireLocalFilesystem, async (req, res) => {
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
      .map(e => ({ name: e.name, isDir: e.isDirectory(), path: path.join(resolved, e.name) }))
      .sort((a, b) => { if (a.isDir && !b.isDir) return -1; if (!a.isDir && b.isDir) return 1; return a.name.localeCompare(b.name); });
    const parent = path.dirname(resolved);
    res.json({ path: resolved, parent: parent !== resolved ? parent : null, children });
  } catch (err) {
    res.status(err.message?.startsWith('Access denied') ? 403 : 500).json({ error: err.message });
  }
});
