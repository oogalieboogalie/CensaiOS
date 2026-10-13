import { createProjectHandoffRecord } from './handoffs.js';
import pool from '../../db.js';
import { resolveWorkspaceContext } from '../../workspaces/context.js';

export async function createProjectHandoff(req, res) {
  try {
    const workspace = await resolveWorkspaceContext(pool, {
      userId: req.session.userId,
      workspaceId: req.body?.workspaceId || null,
    });
    const result = await createProjectHandoffRecord({
      ...(req.body || {}),
      workspaceId: workspace.id,
      userId: req.session.userId,
    });
    res.json(result);
  } catch (err) {
    const status = err.statusCode || (/open a local project|needs a title/i.test(err.message) ? 400 : 500);
    res.status(status).json({ error: err.message });
  }
}
