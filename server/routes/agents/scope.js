import pool from '../../db.js';
import { resolveWorkspaceContext } from '../../workspaces/context.js';

export async function resolveAgentRouteScope(req) {
  const workspace = await resolveWorkspaceContext(pool, {
    userId: req.session.userId,
    workspaceId: req.query.workspaceId || req.body?.workspaceId || null,
  });
  return { userId: req.session.userId, workspaceId: workspace.id };
}

export function agentRouteError(res, error) {
  res.status(error.statusCode || 500).json({ error: error.message, code: error.code });
}
