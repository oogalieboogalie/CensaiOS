// Which user and workspace a window import is for: the signed-in person and
// a workspace they belong to (resolveWorkspaceContext refuses any other).
import pool from '../db.js';
import { resolveWorkspaceContext } from '../workspaces/context.js';

export async function resolveImportScope(req) {
  const workspace = await resolveWorkspaceContext(pool, {
    userId: req.session.userId,
    workspaceId: req.query?.workspaceId || req.body?.workspaceId || null,
  });
  return { userId: req.session.userId, workspaceId: workspace.id };
}
