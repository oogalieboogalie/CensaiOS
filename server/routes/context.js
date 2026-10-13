import express from 'express';
import pool from '../db.js';
import { prioritizeArtifacts } from '../operational-intelligence/prioritization.js';
import { operationalRouteError, resolveOperationalScope } from '../operational-intelligence/routeScope.js';
import { ensureOperationalIntelligenceSchema } from '../operational-intelligence/schema.js';

export const contextRouter = express.Router();

/**
 * GET /api/context/feed
 * Returns a prioritized list of recent notifications and tasks.
 */
contextRouter.get('/context/feed', async (req, res) => {
  try {
    const { workspaceId } = await resolveOperationalScope(req);
    const limit = artifactLimit(req.query.limit, 50);
    // skip schema check in tests if DB is mocked
    if (process.env.NODE_ENV !== 'test') {
      await ensureOperationalIntelligenceSchema(pool);
    }

    // Fetch recent external artifacts
    const { rows: artifacts } = await pool.query(
      `SELECT * FROM artifacts
       WHERE workspace_id = $1
         AND artifact_type IN ('notification', 'external_task', 'external_message', 'task')
         AND status = 'active'
       ORDER BY updated_at DESC LIMIT $2`,
      [workspaceId, limit]
    );

    const prioritized = await prioritizeArtifacts(artifacts, { workspaceId });
    res.json(prioritized);
  } catch (err) {
    operationalRouteError(res, err);
  }
});

/**
 * GET /api/context/search
 * Cross-platform search across all artifacts.
 */
contextRouter.get('/context/search', async (req, res) => {
  try {
    const { workspaceId } = await resolveOperationalScope(req);
    const q = searchText(req.query.q);
    const limit = artifactLimit(req.query.limit, 20);
    if (process.env.NODE_ENV !== 'test') {
      await ensureOperationalIntelligenceSchema(pool);
    }

    const { rows: results } = await pool.query(
      `SELECT *, ts_rank_cd(to_tsvector('english', title || ' ' || data::text), plainto_tsquery('english', $2)) as rank
       FROM artifacts
       WHERE workspace_id = $1
         AND (title ILIKE $3 OR data::text ILIKE $3)
         AND status = 'active'
       ORDER BY rank DESC, updated_at DESC
       LIMIT $4`,
      [workspaceId, q, `%${q}%`, limit]
    );

    res.json(results);
  } catch (err) {
    operationalRouteError(res, err);
  }
});

function artifactLimit(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(1, parsed));
}

function searchText(value) {
  const query = String(value || '').trim();
  if (!query) throw Object.assign(new Error('Search query is required'), { statusCode: 400 });
  return query.slice(0, 256);
}
