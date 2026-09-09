import express from 'express';
import pool from '../../db.js';
import {
  deleteUserState,
  deleteWorkspaceState,
  getUserState,
  getWorkspaceState,
  isSupportedClientStateKey,
  setUserState,
  setWorkspaceState,
  WORKSPACE_STATE_KEY,
} from '../../state/clientStateStore.js';
import { resolveWorkspaceContext } from '../../workspaces/context.js';
import { publishWorkspaceEvent } from '../../collaboration/workspaceHub.js';
import { persistCollaborationEpisodesSafely } from '../../collaboration/episodeStore.js';
import { collaborationHumanActor } from '../../collaboration/humanActor.js';

export const clientStateRouter = express.Router();

function logUnexpectedClientStateError(action, error) {
  if (!error.statusCode || error.statusCode >= 500) {
    console.error(`Failed to ${action} client state:`, error);
  }
}

clientStateRouter.get('/client-state/:key', async (req, res) => {
  const key = req.params.key;
  if (!isSupportedClientStateKey(key)) return res.status(404).json({ error: 'Unknown state key' });

  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    if (key === WORKSPACE_STATE_KEY) {
      const workspace = await resolveWorkspaceContext(pool, {
        userId,
        workspaceId: req.query.workspaceId,
      });
      const state = await getWorkspaceState({ db: pool, workspaceId: workspace.id, key });
      if (!state.found) return res.status(404).json({ value: null, workspaceId: workspace.id, revision: 0 });
      return res.json({
        value: state.value,
        workspaceId: workspace.id,
        revision: state.revision,
        updatedAt: state.updatedAt,
      });
    }
    const state = await getUserState({ db: pool, userId, key });
    if (!state.found) return res.status(404).json({ value: null });
    res.json({ value: state.value });
  } catch (err) {
    logUnexpectedClientStateError('get', err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

clientStateRouter.put('/client-state/:key', async (req, res) => {
  const key = req.params.key;
  if (!isSupportedClientStateKey(key)) return res.status(404).json({ error: 'Unknown state key' });

  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const nextValue = req.body?.value ?? null;

  try {
    if (key === WORKSPACE_STATE_KEY) {
      const workspace = await resolveWorkspaceContext(pool, {
        userId,
        workspaceId: req.body?.workspaceId || nextValue?.workspaceId,
        createIfMissing: true,
      });
      if (workspace.role === 'viewer') {
        return res.status(403).json({ error: 'Workspace role does not allow this operation' });
      }
      const previous = await getWorkspaceState({
        db: pool, workspaceId: workspace.id, key,
      });
      const saved = await setWorkspaceState({
        db: pool,
        workspaceId: workspace.id,
        key,
        value: nextValue,
        expectedRevision: req.body?.expectedRevision,
      });
      const actor = collaborationHumanActor(req.session);
      await persistCollaborationEpisodesSafely(pool, {
        workspaceId: workspace.id,
        previousValue: previous?.value,
        nextValue,
        revision: saved.revision,
        actor,
      });
      const sourceClientId = String(req.body?.clientId || '').slice(0, 96) || null;
      publishWorkspaceEvent(workspace.id, {
        type: 'workspace.committed',
        workspaceId: workspace.id,
        revision: saved.revision,
        value: nextValue,
        sourceClientId,
        actor,
      }, { excludeClientId: sourceClientId });
      return res.json({ ok: true, workspaceId: workspace.id, ...saved });
    }
    await setUserState({ db: pool, userId, key, value: nextValue });
    res.json({ ok: true });
  } catch (err) {
    logUnexpectedClientStateError('save', err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

clientStateRouter.delete('/client-state/:key', async (req, res) => {
  const key = req.params.key;
  if (!isSupportedClientStateKey(key)) return res.status(404).json({ error: 'Unknown state key' });

  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    if (key === WORKSPACE_STATE_KEY) {
      const workspace = await resolveWorkspaceContext(pool, {
        userId,
        workspaceId: req.query.workspaceId,
      });
      if (workspace.role === 'viewer') {
        return res.status(403).json({ error: 'Workspace role does not allow this operation' });
      }
      const removed = await deleteWorkspaceState({
        db: pool,
        workspaceId: workspace.id,
        key,
        expectedRevision: req.query.expectedRevision,
      });
      return res.json({ ok: true, workspaceId: workspace.id, ...removed });
    }
    await deleteUserState({ db: pool, userId, key });
    res.json({ ok: true });
  } catch (err) {
    logUnexpectedClientStateError('delete', err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});
