/**
 * The Grok chat's "Use my Grok sign-in" (server/grokSignin/).
 *
 * GET  /api/cli-agents/grok-signin/status   { installed, version, signedIn, login }
 * POST /api/cli-agents/grok-signin/login    start xAI's code sign-in; { url, code, lines }
 * POST /api/cli-agents/grok-signin/logout
 * POST /api/cli-agents/grok-signin/chat     { text, history?, sessionId? } -> NDJSON chat stream
 *
 * Open to every signed-in person, each on their own Grok account in their own
 * folder: a sign-in is never shared. Mounted inside the Agent Console router,
 * which sits behind requireLocalFilesystem, so a cloud server never runs a CLI
 * for anyone.
 * Logs: 'grok-signin' in the app log.
 */

import express from 'express';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { detectVersion } from '../cli-agents/install.js';
import { grokReadiness, runGrokChat, GrokChatError } from '../grokSignin/chatRun.js';
import { startGrokLogin, grokLoginState, grokLogout } from '../grokSignin/login.js';

const log = createLogger('grok-signin');
export const grokSigninRouter = express.Router();
let seenInstalled = null;

function userOf(req, res) {
  const userId = req.session?.userId ?? null;
  if (userId == null) res.status(401).json({ error: 'Sign in to censaiOS first.' });
  return userId;
}

grokSigninRouter.get('/status', async (req, res) => {
  const userId = userOf(req, res);
  if (userId == null) return;
  const { installed, signedIn } = grokReadiness(userId);
  const version = installed ? (await detectVersion('grok').catch(() => null))?.version || null : null;
  if (installed !== seenInstalled) {
    seenInstalled = installed;
    log.info(installed ? 'grok cli found' : 'grok cli missing', { version });
  }
  res.json({ installed, version, signedIn, login: grokLoginState(userId) });
});

grokSigninRouter.post('/login', async (req, res) => {
  const userId = userOf(req, res);
  if (userId == null) return;
  try {
    res.json({ login: await startGrokLogin(userId) });
  } catch (error) {
    log.warn('grok sign-in could not start', { userId, code: safeErrorCode(error) });
    res.status(error.status || 500).json({ error: error.message, code: error.code || 'GROK_LOGIN_FAILED' });
  }
});

grokSigninRouter.post('/logout', async (req, res) => {
  const userId = userOf(req, res);
  if (userId == null) return;
  await grokLogout(userId).catch((error) => log.warn('grok sign-out failed', { userId, code: safeErrorCode(error) }));
  res.json({ ok: true });
});

grokSigninRouter.post('/chat', async (req, res) => {
  const userId = userOf(req, res);
  if (userId == null) return;
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Type a message first.', code: 'GROK_EMPTY' });
  const history = Array.isArray(req.body?.history) ? req.body.history.slice(-12) : [];
  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : null;
  const controller = new AbortController();
  res.on('close', () => { if (!res.writableFinished) controller.abort(); });
  const emit = (event) => { if (!res.writableEnded) res.write(`${JSON.stringify(event)}\n`); };
  try {
    const run = runGrokChat({ userId, text, history, sessionId, emit, signal: controller.signal });
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders?.();
    await run;
    res.end();
  } catch (error) {
    if (!(error instanceof GrokChatError)) log.error('grok chat could not start', { userId, code: safeErrorCode(error) });
    res.status(error.status || 500).json({ error: error.message, code: error.code || 'GROK_CHAT_FAILED' });
  }
});
