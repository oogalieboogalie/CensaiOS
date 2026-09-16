import express from 'express';
import { randomUUID } from 'crypto';
import pool from '../db.js';
import { verifyCanvasIntegrationToken } from '../security/canvasTokens.js';
import { WORKSPACE_STATE_KEY } from '../state/clientStateStore.js';
import { publishWorkspaceEvent } from '../collaboration/workspaceHub.js';
import { persistCollaborationEpisodesSafely } from '../collaboration/episodeStore.js';

export const canvasRouter = express.Router();

const ALLOWED_KINDS = new Set(['doc', 'code_editor', 'htmlPreview', 'card']);

function extractBearerToken(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  const tokenHeader = req.headers['x-canvas-token'] || req.headers['x-api-key'] || '';
  if (typeof tokenHeader === 'string' && tokenHeader.trim()) {
    return tokenHeader.trim();
  }
  return null;
}

function calculatePlacement(windows, position) {
  if (position && typeof position === 'object') {
    const px = Number(position.x);
    const py = Number(position.y);
    if (Number.isFinite(px) && Number.isFinite(py)) {
      return { x: Math.max(0, Math.round(px)), y: Math.max(0, Math.round(py)) };
    }
  }
  const GAP = 40;
  const rightEdge = windows.reduce((max, win) => (
    Number.isFinite(win.x) && Number.isFinite(win.w) ? Math.max(max, win.x + win.w) : max
  ), 0);
  return { x: rightEdge + GAP || 100, y: 120 };
}

canvasRouter.post('/canvas/cards', async (req, res) => {
  const rawToken = extractBearerToken(req);
  if (!rawToken) {
    return res.status(401).json({
      error: 'Unauthenticated',
      message: 'Bearer token is required in Authorization header.',
    });
  }

  const auth = await verifyCanvasIntegrationToken(pool, rawToken, 'canvas:write');
  if (!auth.valid) {
    return res.status(auth.statusCode || 403).json({
      error: auth.error === 'unauthenticated' ? 'Unauthenticated' : 'Unauthorized',
      message: auth.message,
    });
  }

  const { workspaceId, name: integrationName, preApproved } = auth;
  const body = req.body || {};

  const errors = [];
  const rawTitle = body.title;
  const rawBody = body.body !== undefined ? body.body : body.content;
  const rawKind = body.kind !== undefined ? String(body.kind).trim() : 'doc';

  if (typeof rawTitle !== 'string' || !rawTitle.trim()) {
    errors.push('title must be a non-empty string');
  } else if (rawTitle.trim().length > 150) {
    errors.push('title must be at most 150 characters');
  }

  if (typeof rawBody !== 'string') {
    errors.push('body must be a string');
  }

  if (!ALLOWED_KINDS.has(rawKind)) {
    errors.push(`kind must be one of: ${Array.from(ALLOWED_KINDS).join(', ')}`);
  }

  if (body.position !== undefined && body.position !== null) {
    if (typeof body.position !== 'object' || Array.isArray(body.position)) {
      errors.push('position must be an object with numeric x and y properties');
    } else {
      const px = Number(body.position.x);
      const py = Number(body.position.y);
      if (!Number.isFinite(px) || !Number.isFinite(py)) {
        errors.push('position.x and position.y must be finite numbers');
      }
    }
  }

  if (body.tags !== undefined && body.tags !== null && !Array.isArray(body.tags)) {
    errors.push('tags must be an array of strings');
  }

  if (errors.length > 0) {
    return res.status(422).json({
      error: 'Unprocessable Entity',
      message: 'Validation failed.',
      details: errors,
    });
  }

  const title = rawTitle.trim();
  const textContent = rawBody;
  const kind = rawKind === 'card' ? 'doc' : rawKind;
  const tags = Array.isArray(body.tags) ? body.tags.map(t => String(t).trim()).filter(Boolean) : [];

  // If the integration token is not pre-approved, surface an approval request.
  if (!preApproved) {
    const approvalRecord = await pool.query(
      `INSERT INTO workspace_tool_approvals
         (workspace_id, agent_id, module_id, tool_name, arguments, request_hash, status)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, 'pending')
       RETURNING id, status, created_at`,
      [
        workspaceId,
        'external-integration',
        'canvas-connector',
        'post_card',
        JSON.stringify({ title, body: textContent, kind, tags, position: body.position || null }),
        '0000000000000000000000000000000000000000000000000000000000000000',
      ]
    );

    return res.status(202).json({
      status: 'pending_approval',
      message: 'Card creation is pending human approval.',
      approvalId: approvalRecord.rows[0].id,
      workspaceId,
    });
  }

  // Pre-approved happy path: spawn card/window on workspace canvas.
  const client = await pool.connect();
  let committed;
  let previousValue;
  try {
    await client.query('BEGIN');
    let stateRes = await client.query(
      'SELECT value, revision FROM workspace_client_state WHERE workspace_id=$1 AND key=$2 FOR UPDATE',
      [workspaceId, WORKSPACE_STATE_KEY]
    );

    if (!stateRes.rows[0]) {
      // Initialize default canvas state if missing for workspace
      await client.query(
        `INSERT INTO workspace_client_state (workspace_id, key, value, revision)
         VALUES ($1, $2, $3, 1) ON CONFLICT DO NOTHING`,
        [workspaceId, WORKSPACE_STATE_KEY, JSON.stringify({ wins: [] })]
      );
      stateRes = await client.query(
        'SELECT value, revision FROM workspace_client_state WHERE workspace_id=$1 AND key=$2 FOR UPDATE',
        [workspaceId, WORKSPACE_STATE_KEY]
      );
    }

    previousValue = structuredClone(stateRes.rows[0]?.value || { wins: [] });
    const value = structuredClone(previousValue);
    const windows = Array.isArray(value.wins) ? value.wins : [];

    const placement = calculatePlacement(windows, body.position);
    const now = new Date().toISOString();
    const cardId = randomUUID();

    const win = {
      id: cardId,
      kind,
      title,
      fileName: title,
      text: textContent,
      x: placement.x,
      y: placement.y,
      w: 560,
      h: 460,
      tags,
      createdBy: `integration:${integrationName}`,
      updatedAt: now,
    };

    value.wins = [...windows, win];
    value.updatedAt = now;

    const updated = await client.query(
      `UPDATE workspace_client_state SET value=$3, revision=revision+1, updated_at=NOW()
       WHERE workspace_id=$1 AND key=$2 RETURNING revision, updated_at`,
      [workspaceId, WORKSPACE_STATE_KEY, JSON.stringify(value)]
    );

    committed = {
      workspaceId,
      revision: Number(updated.rows[0].revision),
      value,
      window: win,
    };

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('Failed to post canvas card:', err);
    return res.status(500).json({ error: 'Failed to create canvas card.' });
  } finally {
    client.release();
  }

  const actorLabel = `Integration (${integrationName})`;
  await persistCollaborationEpisodesSafely(pool, {
    workspaceId,
    previousValue,
    nextValue: committed.value,
    revision: committed.revision,
    actor: { type: 'agent', id: 'external-integration', label: actorLabel },
  });

  publishWorkspaceEvent(workspaceId, {
    type: 'workspace.committed',
    workspaceId,
    revision: committed.revision,
    value: committed.value,
    sourceClientId: null,
    actor: { type: 'agent', id: 'external-integration', label: actorLabel },
    activity: {
      kind: 'canvas.window.spawned',
      windowId: committed.window.id,
      label: `${actorLabel} posted card "${committed.window.title}"`,
    },
  });

  const encodedTitle = encodeURIComponent(title);
  const deepLink = `hb://doc/${encodedTitle}`;
  const webUrl = `/workspace/${workspaceId}?card=${committed.window.id}`;

  return res.status(201).json({
    id: committed.window.id,
    title: committed.window.title,
    kind: committed.window.kind,
    workspaceId,
    url: deepLink,
    deepLink,
    webUrl,
    position: { x: committed.window.x, y: committed.window.y },
    createdAt: committed.window.updatedAt,
  });
});
