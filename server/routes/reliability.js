import express from 'express';
import pool from '../db.js';
import fs from 'node:fs';
import path from 'node:path';
import { scanFile, loadConfig } from '../lib/reliability/engine.js';
import { resourceRateLimiter } from '../middleware/standardRateLimits.js';
import { operationalRouteError, resolveOperationalScope } from '../operational-intelligence/routeScope.js';
import { requireLocalFilesystem } from '../middleware/runtimeMode.js';
import { projectScanHandler } from './reliabilityProject.js';

export const reliabilityRouter = express.Router();
reliabilityRouter.use(resourceRateLimiter);

const REPOSITORY_ROOT = fs.realpathSync(process.cwd());

function isInsideRepository(candidate) {
  const relative = path.relative(REPOSITORY_ROOT, candidate);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

export function validateReliabilityPath(filePath) {
  const normalized = typeof filePath === 'string' ? filePath.replaceAll('\\', '/') : '';
  if (!normalized || normalized.includes('\0') || path.isAbsolute(filePath) || /^(?:[A-Za-z]:\/|\/\/)/.test(normalized)) {
    throw new Error('Invalid path: outside of repository root');
  }
  const segments = normalized.split('/');
  if (segments.some((segment) => segment === '..')) {
    throw new Error('Invalid path: outside of repository root');
  }
  const candidate = path.resolve(REPOSITORY_ROOT, ...segments);
  if (!isInsideRepository(candidate)) {
    throw new Error('Invalid path: outside of repository root');
  }
  if (fs.existsSync(candidate)) {
    const realCandidate = fs.realpathSync(candidate);
    if (!isInsideRepository(realCandidate)) {
      throw new Error('Invalid path: outside of repository root');
    }
    return realCandidate;
  }
  return candidate;
}

function hasAdjacentTest(fullPath) {
  const ext = path.extname(fullPath);
  if (['.js', '.jsx', '.mjs'].includes(ext)) {
    return fs.existsSync(fullPath.slice(0, -ext.length) + '.test.js');
  }
  if (ext === '.py') {
    return fs.existsSync(path.join(path.dirname(fullPath), `test_${path.basename(fullPath)}`));
  }
  return false;
}

// Scans belong to one board. Every route resolves the caller's board through
// workspace membership. Reads without a workspaceId fall back to their own
// board; writes must name the board.
function reliabilityScope(req, options = {}) {
  return resolveOperationalScope(req, { requireWorkspace: false, ...options });
}

reliabilityRouter.get('/scans', async (req, res) => {
  let scope;
  try {
    scope = await reliabilityScope(req);
  } catch (err) {
    return operationalRouteError(res, err);
  }
  try {
    const { rows } = await pool.query(
      'SELECT * FROM ai_reliability_scans WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 100',
      [scope.workspaceId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

reliabilityRouter.post('/scans', async (req, res) => {
  let scope;
  try {
    scope = await reliabilityScope(req, { write: true, requireWorkspace: true });
  } catch (err) {
    return operationalRouteError(res, err);
  }
  try {
    const { filePath } = req.body || {};
    if (!filePath) return res.status(400).json({ error: 'filePath is required' });

    let fullPath;
    try {
      fullPath = validateReliabilityPath(filePath);
    } catch (e) {
      return res.status(403).json({ error: e.message });
    }

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    const config = await loadConfig();
    const result = scanFile(filePath, content, config, { hasTests: hasAdjacentTest(fullPath) });

    const { rows } = await pool.query(
      'INSERT INTO ai_reliability_scans (workspace_id, file_path, score, heuristics) VALUES ($1, $2, $3, $4) RETURNING *',
      [scope.workspaceId, filePath, result.score, JSON.stringify(result.heuristics)]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

reliabilityRouter.post('/scans/project', requireLocalFilesystem, projectScanHandler(reliabilityScope, operationalRouteError));

reliabilityRouter.post('/feedback', async (req, res) => {
  let scope;
  try {
    scope = await reliabilityScope(req, { write: true, requireWorkspace: true });
  } catch (err) {
    return operationalRouteError(res, err);
  }
  try {
    const { scanId, helpful, comment } = req.body || {};
    // Only scans on the caller's own board can take feedback.
    const { rows } = await pool.query(
      `INSERT INTO ai_reliability_feedback (scan_id, helpful, comment)
       SELECT id, $3, $4 FROM ai_reliability_scans WHERE id = $1 AND workspace_id = $2
       RETURNING *`,
      [scanId, scope.workspaceId, helpful, comment]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Scan not found' });
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
