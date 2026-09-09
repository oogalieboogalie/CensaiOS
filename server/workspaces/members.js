import { ensurePersonalWorkspace, requireWorkspaceMember } from './context.js';

const MANAGE_ROLES = Object.freeze(['owner', 'admin']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class WorkspaceMemberError extends Error {
  constructor(message, { code = 'WORKSPACE_MEMBER_ERROR', statusCode = 400 } = {}) {
    super(message);
    this.name = 'WorkspaceMemberError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function normalizedEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.length > 320) {
    throw new WorkspaceMemberError('Enter a valid registered account email.', {
      code: 'INVALID_MEMBER_EMAIL',
    });
  }
  return email;
}

function publicWorkspace(workspace) {
  return { id: workspace.id, name: workspace.name, role: workspace.role };
}

export async function listWorkspaceMembers(db, { workspaceId, userId }) {
  const workspace = await requireWorkspaceMember(db, { workspaceId, userId });
  const { rows } = await db.query(
    `SELECT u.id,u.email,u.name,wm.role,wm.created_at
       FROM workspace_members wm
       JOIN users u ON u.id=wm.user_id
      WHERE wm.workspace_id=$1
      ORDER BY CASE wm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
               LOWER(COALESCE(u.name,u.email))`,
    [workspace.id],
  );
  return { workspace: publicWorkspace(workspace), members: rows };
}

export async function leaveWorkspaceMembership(db, { workspaceId, userId }) {
  const workspace = await requireWorkspaceMember(db, { workspaceId, userId });
  if (workspace.role === 'owner') {
    throw new WorkspaceMemberError('Workspace owners cannot leave their workspace.', {
      code: 'WORKSPACE_OWNER_CANNOT_LEAVE',
      statusCode: 409,
    });
  }
  const personalWorkspace = await ensurePersonalWorkspace(db, userId);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const deleted = await client.query(
      `DELETE FROM workspace_members
        WHERE workspace_id=$1 AND user_id=$2 AND role<>'owner'
        RETURNING workspace_id`,
      [workspace.id, userId],
    );
    if (!deleted.rows[0]) {
      throw new WorkspaceMemberError('Workspace membership changed before it could be removed.', {
        code: 'WORKSPACE_MEMBERSHIP_CHANGED',
        statusCode: 409,
      });
    }
    await client.query('COMMIT');
    return { leftWorkspace: publicWorkspace(workspace), workspace: personalWorkspace };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function inviteRegisteredWorkspaceMember(db, { workspaceId, userId, email }) {
  const workspace = await requireWorkspaceMember(db, {
    workspaceId,
    userId,
    roles: MANAGE_ROLES,
  });
  const targetEmail = normalizedEmail(email);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const target = await client.query(
      'SELECT id,email,name FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1',
      [targetEmail],
    );
    if (!target.rows[0]) {
      throw new WorkspaceMemberError(
        'That account has not registered yet. Ask them to sign in once, then invite them again.',
        { code: 'REGISTERED_ACCOUNT_REQUIRED', statusCode: 404 },
      );
    }
    const inserted = await client.query(
      `INSERT INTO workspace_members(workspace_id,user_id,role)
       VALUES($1,$2,'member') ON CONFLICT(workspace_id,user_id) DO NOTHING`,
      [workspace.id, target.rows[0].id],
    );
    await client.query('UPDATE workspaces SET updated_at=NOW() WHERE id=$1', [workspace.id]);
    const member = await client.query(
      `SELECT u.id,u.email,u.name,wm.role,wm.created_at
         FROM workspace_members wm JOIN users u ON u.id=wm.user_id
        WHERE wm.workspace_id=$1 AND wm.user_id=$2`,
      [workspace.id, target.rows[0].id],
    );
    await client.query('COMMIT');
    return {
      workspace: publicWorkspace(workspace),
      member: member.rows[0],
      alreadyMember: inserted.rowCount === 0,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export const WORKSPACE_MEMBER_MANAGE_ROLES = MANAGE_ROLES;
