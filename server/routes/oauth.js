import express from 'express';
import { resourceRateLimiter } from '../middleware/standardRateLimits.js';
import { saveOAuthCredential, getOAuthCredential } from '../credentials/oauthStore.js';
import {
  getOAuthProvider,
  listOAuthProviders,
  newStateToken,
} from '../providers/oauthProvider.js';

// OAuth dance endpoints (Phase 2.a contract). Tokens are written ONLY
// through the hardened oauthStore vault (encrypted at rest, raw columns
// forced NULL) and are NEVER returned to clients — responses carry ok /
// scope / expiry metadata. Actor identity is explicit: callers pass
// userId (local-first v0.1); the auth guard binds it in hosted mode.
export const oauthRouter = express.Router();
oauthRouter.use(resourceRateLimiter);

const pendingStates = new Map();
const STATE_TTL_MS = 10 * 60 * 1000;

function rememberState(provider, redirectUri) {
  const state = newStateToken();
  pendingStates.set(state, { provider, redirectUri, createdAt: Date.now() });
  return state;
}

function consumeState(provider, state) {
  const pending = pendingStates.get(state);
  if (!pending || pending.provider !== provider) return null;
  pendingStates.delete(state);
  if (Date.now() - pending.createdAt > STATE_TTL_MS) return null;
  return pending;
}

setInterval(() => {
  const now = Date.now();
  for (const [state, pending] of pendingStates) {
    if (now - pending.createdAt > STATE_TTL_MS) pendingStates.delete(state);
  }
}, STATE_TTL_MS).unref?.();

function requireUserId(req) {
  const userId = String(req.query.userId || req.body?.userId || '').trim();
  return userId || null;
}

oauthRouter.get('/:provider/authorize', (req, res) => {
  const provider = getOAuthProvider(req.params.provider);
  if (!provider) return res.status(404).json({ error: 'Unknown OAuth provider' });
  const redirectUri = String(req.query.redirectUri || '').trim();
  if (!redirectUri) return res.status(400).json({ error: 'redirectUri is required' });
  try {
    const state = rememberState(provider.id, redirectUri);
    const authorizationUrl = provider.getAuthorizationUrl({ state, redirectUri });
    res.json({ authorizationUrl, state });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

oauthRouter.get('/:provider/callback', async (req, res) => {
  const provider = getOAuthProvider(req.params.provider);
  if (!provider) return res.status(404).json({ error: 'Unknown OAuth provider' });
  const userId = requireUserId(req);
  if (!userId) return res.status(400).json({ error: 'userId is required' });
  const { code, state } = req.query;
  if (!code || !state) return res.status(400).json({ error: 'code and state are required' });
  const pending = consumeState(provider.id, String(state));
  if (!pending) return res.status(403).json({ error: 'Invalid or expired OAuth state' });
  try {
    const tokens = await provider.exchangeCodeForToken({ code: String(code), redirectUri: pending.redirectUri });
    if (!tokens?.access_token) return res.status(502).json({ error: 'Token exchange returned no access token' });
    await saveOAuthCredential({
      userId,
      provider: provider.id,
      tokens: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        expiry_date: tokens.expiry_date || tokens.expires_in || null,
        scope: tokens.scope || null,
      },
    });
    res.json({ ok: true, provider: provider.id, scope: tokens.scope || null });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

oauthRouter.post('/:provider/refresh', async (req, res) => {
  const provider = getOAuthProvider(req.params.provider);
  if (!provider) return res.status(404).json({ error: 'Unknown OAuth provider' });
  const userId = requireUserId(req);
  if (!userId) return res.status(400).json({ error: 'userId is required' });
  try {
    const stored = await getOAuthCredential({ userId, provider: provider.id });
    if (!stored?.refresh_token) return res.status(409).json({ error: 'No refresh token stored for this provider' });
    const tokens = await provider.refreshToken({ refreshToken: stored.refresh_token });
    if (!tokens?.access_token) return res.status(502).json({ error: 'Refresh returned no access token' });
    await saveOAuthCredential({
      userId,
      provider: provider.id,
      tokens: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || stored.refresh_token,
        expiry_date: tokens.expiry_date || tokens.expires_in || null,
        scope: tokens.scope || stored.scope || null,
      },
    });
    res.json({ ok: true, provider: provider.id });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

oauthRouter.get('/providers', (req, res) => {
  res.json({ providers: listOAuthProviders() });
});
