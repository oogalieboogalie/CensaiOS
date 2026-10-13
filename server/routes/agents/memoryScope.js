import pool from '../../db.js';
import { resolveWorkspaceContext } from '../../workspaces/context.js';

export async function resolveRequestMemoryScope(req) {
  const userId = Number(req.session?.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    const error = new Error('Authentication required for agent memory.');
    error.statusCode = 401;
    throw error;
  }
  const requestedWorkspaceId = req.body?.workspaceId || req.query?.workspaceId || null;
  if (!requestedWorkspaceId) {
    const error = new Error('Open a workspace to access agent memory.');
    error.statusCode = 400;
    throw error;
  }
  const workspace = await resolveWorkspaceContext(pool, { userId, workspaceId: requestedWorkspaceId });
  return { workspaceId: workspace.id, userId };
}

export function memoryRouteError(res, error) {
  return res.status(error.statusCode || 500).json({ error: error.message, code: error.code });
}
