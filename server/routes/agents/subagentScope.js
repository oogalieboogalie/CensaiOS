import pool from '../../db.js';
import { resolveWorkspaceContext } from '../../workspaces/context.js';

export async function resolveSubAgentRouteScope(req) {
  const userId = Number(req.session?.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    const error = new Error('Authentication required for sub-agents.');
    error.statusCode = 401;
    throw error;
  }
  const workspaceId = req.body?.workspaceId || req.query?.workspaceId || null;
  if (!workspaceId) {
    const error = new Error('Open a workspace to access sub-agents.');
    error.statusCode = 400;
    throw error;
  }
  const workspace = await resolveWorkspaceContext(pool, { userId, workspaceId });
  return { workspaceId: workspace.id, userId };
}
