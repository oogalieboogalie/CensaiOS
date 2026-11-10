// server/routes/githubAgentWebhook.js
//
// GitHub's webhook for coding jobs agents hand to the @grok / @claude
// workflows (server/github/agentTasks.js). Mounted before the sign-in guard
// with a raw body so the X-Hub-Signature-256 can be checked, like Stripe's
// (server/routes/lessonsBilling.js). Off (503) until
// GITHUB_AGENT_WEBHOOK_SECRET is set. Never calls GitHub back.

import express from 'express';
import pool from '../db.js';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { handleGithubAgentDelivery, verifyGithubSignature } from '../github/agentTasks.js';

const log = createLogger('github-agent-webhook');

export const GITHUB_AGENT_WEBHOOK_PATH = '/api/webhooks/github-agent';

/** The router, with its database and notice sender swappable for tests. */
export function createGithubAgentWebhookRouter({ db = pool, notify } = {}) {
  const router = express.Router();
  router.post('/github-agent', express.raw({ type: '*/*', limit: '2mb' }), async (req, res) => {
    const secret = process.env.GITHUB_AGENT_WEBHOOK_SECRET;
    const event = String(req.get('x-github-event') || '').slice(0, 64);
    if (!secret) {
      log.warn('github agent webhook off', { event });
      return res.status(503).json({ error: 'This webhook is off: GITHUB_AGENT_WEBHOOK_SECRET is not set.' });
    }
    const raw = Buffer.isBuffer(req.body) ? req.body : null;
    if (!verifyGithubSignature(raw, req.get('x-hub-signature-256'), secret)) {
      log.warn('github agent webhook refused', { event, reason: 'bad_signature' });
      return res.status(401).json({ error: 'Bad signature.' });
    }
    let payload;
    try {
      payload = JSON.parse(raw.toString('utf8'));
    } catch {
      log.warn('github agent webhook refused', { event, reason: 'not_json' });
      return res.status(400).json({ error: 'Body is not JSON.' });
    }
    const action = String(payload?.action || '').slice(0, 64);
    try {
      const result = await handleGithubAgentDelivery(db, { event, payload }, notify ? { notify } : {});
      const failedNotices = (result.notices || []).filter((n) => n !== true).length;
      log.info('github agent webhook delivery', {
        event, action, matched: result.matched, linked: result.linked || 0,
        changed: result.changed.length, failedNotices,
      });
      if (!result.handled) return res.status(204).end();
      return res.status(200).json({ received: true, matched: result.matched });
    } catch (error) {
      log.warn('github agent webhook failed', { event, action, code: safeErrorCode(error) });
      return res.status(500).json({ error: 'Could not apply this delivery yet.' });
    }
  });
  return router;
}

export const githubAgentWebhookRouter = createGithubAgentWebhookRouter();
