function text(value, label) {
  const result = String(value ?? '').trim();
  if (!result) throw new Error(`${label} is required`);
  return result;
}

function defaultWorkspaceId(userId) {
  return `user-${userId}-default`;
}

export async function requireWorkspaceMember(db, {
  userId,
  workspaceId,
  roles = ['owner', 'admin', 'member', 'viewer'],
}) {
  const id = text(workspaceId, 'workspaceId');
  const { rows } = await db.query(
    `SELECT w.id, w.name, wm.role
       FROM workspaces w
       JOIN workspace_members wm ON wm.workspace_id = w.id
      WHERE w.id = $1 AND wm.user_id = $2`,
    [id, userId]
  );
  const workspace = rows[0];
  if (!workspace) {
    const error = new Error('Workspace access denied');
    error.statusCode = 403;
    throw error;
  }
  if (!roles.includes(workspace.role)) {
    const error = new Error('Workspace role does not allow this operation');
    error.statusCode = 403;
    throw error;
  }
  return workspace;
}

export async function ensureUserDefaultWorkspace(db, userId) {
  const existing = await db.query(
    `SELECT w.id, w.name, w.tenant_id, wm.role
       FROM workspaces w
       JOIN workspace_members wm ON wm.workspace_id = w.id
       LEFT JOIN workspace_client_state wcs
         ON wcs.workspace_id = w.id AND wcs.key = 'homebase.workspace.v1'
      WHERE wm.user_id = $1
      ORDER BY (wcs.value IS NOT NULL) DESC, w.updated_at DESC
      LIMIT 1`,
    [userId]
  );
  if (existing.rows[0]) return attachTenantId(existing.rows[0], existing.rows[0].tenant_id);
  return createOwnedWorkspace(db, {
    userId,
    workspaceId: defaultWorkspaceId(userId),
    name: 'My Workspace',
  });
}

export async function ensurePersonalWorkspace(db, userId) {
  const workspaceId = defaultWorkspaceId(userId);
  const existing = await db.query(
    'SELECT id,name,tenant_id,created_by_user_id FROM workspaces WHERE id = $1',
    [workspaceId],
  );
  if (!existing.rows[0]) {
    return createOwnedWorkspace(db, { userId, workspaceId, name: 'My Workspace' });
  }
  if (Number(existing.rows[0].created_by_user_id) !== Number(userId)) {
    const error = new Error('Personal workspace ownership conflict');
    error.statusCode = 409;
    throw error;
  }
  await db.query(
    `INSERT INTO workspace_members (workspace_id, user_id, role)
     VALUES ($1, $2, 'owner') ON CONFLICT (workspace_id, user_id) DO UPDATE SET role='owner'`,
    [workspaceId, userId],
  );
  const context = await requireWorkspaceMember(db, { userId, workspaceId });
  return attachTenantId(context, existing.rows[0].tenant_id);
}

export async function resolveWorkspaceContext(db, {
  userId,
  workspaceId,
  createIfMissing = false,
}) {
  if (!workspaceId) return ensureUserDefaultWorkspace(db, userId);
  const existing = await db.query(
    'SELECT id, tenant_id FROM workspaces WHERE id = $1',
    [workspaceId]
  );
  if (existing.rows[0]) {
    const context = await requireWorkspaceMember(db, { userId, workspaceId });
    return attachTenantId(context, existing.rows[0].tenant_id);
  }
  if (!createIfMissing) {
    const error = new Error('Workspace not found');
    error.statusCode = 404;
    throw error;
  }
  return createOwnedWorkspace(db, { userId, workspaceId, name: 'Workspace' });
}

// Existing rows may not have a tenant_id yet; default to null so callers always
// see the same shape. The brief guarantees the column is nullable + idempotent.
function attachTenantId(context, tenantId) {
  return { ...context, tenantId: tenantId ?? null };
}

async function createOwnedWorkspace(db, { userId, workspaceId, name }) {
  const created = await db.query(
    `INSERT INTO workspaces (id, name, created_by_user_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [workspaceId, name, userId]
  );
  if (!created.rows[0]) {
    const context = await requireWorkspaceMember(db, { userId, workspaceId });
    return attachTenantId(context, null);
  }
  await db.query(
    `INSERT INTO workspace_members (workspace_id, user_id, role)
     VALUES ($1, $2, 'owner')
     ON CONFLICT (workspace_id, user_id) DO NOTHING`,
    [workspaceId, userId]
  );
  const context = await requireWorkspaceMember(db, { userId, workspaceId });
  return attachTenantId(context, null);
}
