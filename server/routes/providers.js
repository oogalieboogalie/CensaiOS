// ─── Provider Service Registry Route ─────────────────────────────────────────
// Mounts at /api/providers. Reports connection state for every provider declared
// by a window's `integration` block and implemented in server/providers/registry.js.
// It NEVER returns the underlying credential — only the public adapter shape and
// the normalized connection state. The frontend ProviderConnectWindow talks here.

import { Router } from 'express';
import {
  getProviderAdapter,
  listProviderAdapters,
  resolveConnectionState,
} from '../providers/registry.js';

export const providersRouter = Router();

/** Public, secret-free projection of an adapter + its resolved connection state. */
function publicShape(adapter, stateInfo) {
  return {
    id: adapter.id,
    authMode: adapter.authMode,
    configured: stateInfo.configured,
    state: stateInfo.state,
    ...(stateInfo.detail ? { detail: stateInfo.detail } : {}),
  };
}

// List all registered providers with a cheap (no-network) connection state.
providersRouter.get('/', async (req, res) => {
  try {
    const ctx = { req };
    const providers = [];
    for (const adapter of listProviderAdapters()) {
      const stateInfo = await resolveConnectionState(adapter, ctx, { runTest: false });
      providers.push(publicShape(adapter, stateInfo));
    }
    res.json({ providers });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// Cheap status for one provider (no live probe).
providersRouter.get('/:id/status', async (req, res) => {
  const adapter = getProviderAdapter(req.params.id);
  if (!adapter) return res.status(404).json({ error: `Unknown provider "${req.params.id}"` });
  try {
    const stateInfo = await resolveConnectionState(adapter, { req }, { runTest: false });
    res.json(publicShape(adapter, stateInfo));
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// Live connection test — runs the adapter's authenticated probe.
providersRouter.post('/:id/test', async (req, res) => {
  const adapter = getProviderAdapter(req.params.id);
  if (!adapter) return res.status(404).json({ error: `Unknown provider "${req.params.id}"` });
  try {
    const stateInfo = await resolveConnectionState(adapter, { req }, { runTest: true });
    res.json(publicShape(adapter, stateInfo));
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});
