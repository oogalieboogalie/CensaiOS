import pool from '../../db.js';
import { resolveWorkspaceContext } from '../../workspaces/context.js';

export async function resolveAgentRouteScope(req, { roles } = {}) {
  const requested = req.query.workspaceId || req.body?.workspaceId || null;
  const workspace = await resolveWorkspaceContext(pool, {
    userId: req.session.userId,
    workspaceId: requested,
    // A named board is checked here. A missing id uses the caller's own board
    // and skips that check, so the role is checked again below either way.
    ...(roles && requested ? { roles } : {}),
  });
  if (roles && !roles.includes(workspace.role)) {
    const error = new Error('Workspace role does not allow this operation');
    error.statusCode = 403;
    throw error;
  }
  return { userId: req.session.userId, workspaceId: workspace.id, role: workspace.role };
}

export function agentRouteError(res, error) {
  res.status(error.statusCode || 500).json({ error: error.message, code: error.code });
}
