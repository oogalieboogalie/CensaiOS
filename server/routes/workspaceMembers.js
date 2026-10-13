import express from 'express';
import pool from '../db.js';
import {
  inviteRegisteredWorkspaceMember,
  leaveWorkspaceMembership,
  listWorkspaceMembers,
} from '../workspaces/members.js';
import { ensurePersonalWorkspace } from '../workspaces/context.js';

export const workspaceMembersRouter = express.Router();

function publicMember(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    joinedAt: row.created_at,
  };
}

function handleError(res, error) {
  res.status(error.statusCode || 500).json({
    error: error.message,
    ...(error.code ? { code: error.code } : {}),
  });
}

workspaceMembersRouter.get('/workspaces/:workspaceId/members', async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const result = await listWorkspaceMembers(pool, {
      workspaceId: req.params.workspaceId,
      userId: req.session.userId,
    });
    res.json({
      workspace: result.workspace,
      members: result.members.map(publicMember),
    });
  } catch (error) {
    handleError(res, error);
  }
});

workspaceMembersRouter.post('/workspaces/:workspaceId/members', async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const result = await inviteRegisteredWorkspaceMember(pool, {
      workspaceId: req.params.workspaceId,
      userId: req.session.userId,
      email: req.body?.email,
    });
    res.status(result.alreadyMember ? 200 : 201).json({
      workspace: result.workspace,
      member: publicMember(result.member),
      alreadyMember: result.alreadyMember,
    });
  } catch (error) {
    handleError(res, error);
  }
});

workspaceMembersRouter.post('/workspaces/personal', async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    res.json({ workspace: await ensurePersonalWorkspace(pool, req.session.userId) });
  } catch (error) {
    handleError(res, error);
  }
});

workspaceMembersRouter.delete('/workspaces/:workspaceId/members/me', async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    res.json(await leaveWorkspaceMembership(pool, {
      workspaceId: req.params.workspaceId,
      userId: req.session.userId,
    }));
  } catch (error) {
    handleError(res, error);
  }
});
