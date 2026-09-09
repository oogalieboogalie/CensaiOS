import express from 'express';
import pool from '../../db.js';
import {
  ToolPackageError,
  installWorkspaceToolPackage,
  listWorkspaceToolPackages,
  removeWorkspaceToolPackage,
} from '../../capabilities/packageStore.js';

export const toolPackagesRouter = express.Router();

function scope(req) {
  const userId = Number(req.session?.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new ToolPackageError('Authentication is required.', 401, 'AUTHENTICATION_REQUIRED');
  }
  const queryId = String(req.query?.workspaceId || '').trim();
  const bodyId = String(req.body?.workspaceId || '').trim();
  if (queryId && bodyId && queryId !== bodyId) {
    throw new ToolPackageError('Conflicting workspace IDs are not allowed.', 400,
      'TOOL_PACKAGE_SCOPE_CONFLICT');
  }
  const workspaceId = queryId || bodyId;
  if (!workspaceId) throw new ToolPackageError('Open a workspace to manage add-ons.', 400,
    'TOOL_PACKAGE_SCOPE_REQUIRED');
  return { workspaceId, userId };
}

function sendError(res, error) {
  const status = Number(error?.statusCode);
  if (status >= 400 && status < 500) {
    return res.status(status).json({ error: error.message, code: error.code });
  }
  return res.status(500).json({ error: 'Tool packages are temporarily unavailable.' });
}

toolPackagesRouter.get('/tool-packages', async (req, res) => {
  try {
    const auth = scope(req);
    res.json({ workspaceId: auth.workspaceId, ...await listWorkspaceToolPackages(pool, auth) });
  } catch (error) {
    sendError(res, error);
  }
});

toolPackagesRouter.put('/tool-packages/:packageId/install', async (req, res) => {
  try {
    const result = await installWorkspaceToolPackage(pool, {
      ...scope(req), packageId: req.params.packageId,
    });
    res.status(result.created ? 201 : 200).json(result);
  } catch (error) {
    sendError(res, error);
  }
});

toolPackagesRouter.delete('/tool-packages/:packageId/install', async (req, res) => {
  try {
    res.json(await removeWorkspaceToolPackage(pool, {
      ...scope(req), packageId: req.params.packageId,
    }));
  } catch (error) {
    sendError(res, error);
  }
});
