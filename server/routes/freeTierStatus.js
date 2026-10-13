import express from 'express';
import pool from '../db.js';
import { getFreeTierAllowanceStatus } from '../aiGateway/freeTierAllowance.js';
import { resolveFreeTierRuntime } from '../aiGateway/freeTierRuntime.js';
import { resolveWorkspaceContext } from '../workspaces/context.js';

const STATUS_UNAVAILABLE = Object.freeze({
  error: 'free_ai_status_unavailable',
  message: 'Free AI allowance status is temporarily unavailable.',
});

export const freeTierStatusRouter = express.Router();

freeTierStatusRouter.get('/status', async (req, res) => {
  const userId = Number(req.session?.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(401).json({ error: 'authentication_required' });
  }

  const workspaceId = String(req.query?.workspaceId ?? '').trim();
  if (!workspaceId) {
    return res.status(400).json({ error: 'workspace_required' });
  }

  let workspace;
  try {
    workspace = await resolveWorkspaceContext(pool, { userId, workspaceId });
  } catch (error) {
    if (error?.statusCode === 403) {
      return res.status(403).json({ error: 'workspace_access_denied' });
    }
    if (error?.statusCode === 404) {
      return res.status(404).json({ error: 'workspace_not_found' });
    }
    return unavailable(res);
  }

  try {
    const runtime = resolveFreeTierRuntime({ requirePlatformKey: true });
    if (!runtime.enabled) {
      return res.json({ enabled: false });
    }
    const config = runtime.config;

    const byok = await hasOpenRouterByok(userId);
    const status = await getFreeTierAllowanceStatus({
      db: pool,
      config,
      userId,
      workspaceId: workspace.id,
      source: 'http.free-tier-status',
    });
    const allowance = allowanceView(status);
    return res.json({
      enabled: true,
      provider: config.provider,
      model: config.model,
      allowance,
      resets: {
        timezone: 'UTC',
        userDailyAt: allowance.user.resetsAt,
        sharedDailyAt: allowance.shared.resetsAt,
        sharedMinuteAt: allowance.minute.resetsAt,
      },
      byok: { provider: 'openrouter', configured: byok },
    });
  } catch {
    return unavailable(res);
  }
});

async function hasOpenRouterByok(userId) {
  const { rows } = await pool.query(
    `SELECT EXISTS (
       SELECT 1 FROM user_api_keys
       WHERE user_id = $1 AND provider = $2
     ) AS configured`,
    [userId, 'openrouter'],
  );
  return rows[0]?.configured === true;
}

function allowanceView(status) {
  return {
    user: allowanceBand(status?.user),
    shared: allowanceBand(status?.shared),
    minute: allowanceBand(status?.minute),
  };
}

function allowanceBand(value) {
  const resetsAt = new Date(value?.resetsAt).toISOString();
  const band = {
    limit: value?.limit,
    used: value?.used,
    reserved: value?.reserved,
    remaining: value?.remaining,
    resetsAt,
  };
  for (const field of ['limit', 'used', 'reserved', 'remaining']) {
    if (!Number.isSafeInteger(band[field]) || band[field] < 0) {
      throw new TypeError(`Invalid allowance ${field}`);
    }
  }
  return band;
}

function unavailable(res) {
  return res.status(503).json(STATUS_UNAVAILABLE);
}
