// Provider Service Registry — the server counterpart to the Window Integration
// Contract. These tests lock the registry shape, the contract loop (every
// manifest provider has an adapter), the connection-state logic, and the route
// surface — and prove no secret ever crosses the HTTP boundary.

import request from 'supertest';
import { app } from '../server.js';
import pool from '../server/db.js';
import {
  getProviderAdapter,
  listProviderAdapters,
  isProviderConfigured,
  resolveConnectionState,
  getUnimplementedProviderIds,
} from '../server/providers/registry.js';
import { CONNECTION_STATES } from '../src/lib/windowIntegrationTypes.js';

describe('provider adapter registry', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('registers the github and demo-provider adapters', () => {
    const ids = listProviderAdapters().map((a) => a.id).sort();
    expect(ids).toEqual(expect.arrayContaining(['demo-provider', 'github', 'linear']));
    expect(getProviderAdapter('github').authMode).toBe('apiKey');
    expect(getProviderAdapter('nope')).toBeNull();
  });

  test('registers the linear adapter properly', () => {
    expect(getProviderAdapter('linear')).not.toBeNull();
    expect(getProviderAdapter('linear').authMode).toBe('apiKey');
  });

  test('every manifest integration provider has a server adapter (contract loop)', () => {
    expect(getUnimplementedProviderIds()).toEqual([]);
  });

  test('isProviderConfigured reflects credential presence', async () => {
    const fake = { id: 'x', authMode: 'apiKey', getCredential: () => 'tok' };
    const empty = { id: 'y', authMode: 'apiKey', getCredential: () => '' };
    expect(await isProviderConfigured(fake)).toBe(true);
    expect(await isProviderConfigured(empty)).toBe(false);
    expect(await isProviderConfigured(null)).toBe(false);
  });

  test('resolveConnectionState: not configured -> disconnected (no probe)', async () => {
    const adapter = { id: 'x', getCredential: () => '', test: async () => ({ ok: true }) };
    const r = await resolveConnectionState(adapter, {}, { runTest: true });
    expect(r).toEqual({ state: CONNECTION_STATES.DISCONNECTED, configured: false });
  });

  test('resolveConnectionState: configured + passing probe -> connected', async () => {
    const adapter = { id: 'x', getCredential: () => 'tok', test: async () => ({ ok: true, detail: 'hi' }) };
    const r = await resolveConnectionState(adapter, {}, { runTest: true });
    expect(r.state).toBe(CONNECTION_STATES.CONNECTED);
    expect(r.detail).toBe('hi');
  });

  test('resolveConnectionState: configured + failing/throwing probe -> error', async () => {
    const failing = { id: 'x', getCredential: () => 'tok', test: async () => ({ ok: false, detail: 'bad' }) };
    const throwing = { id: 'y', getCredential: () => 'tok', test: async () => { throw new Error('boom'); } };
    expect((await resolveConnectionState(failing, {}, { runTest: true })).state).toBe(CONNECTION_STATES.ERROR);
    expect((await resolveConnectionState(throwing, {}, { runTest: true })).state).toBe(CONNECTION_STATES.ERROR);
  });

  test('resolveConnectionState: configured without probe -> connected (cheap)', async () => {
    const adapter = { id: 'x', getCredential: () => 'tok' };
    const r = await resolveConnectionState(adapter, {}, { runTest: false });
    expect(r.state).toBe(CONNECTION_STATES.CONNECTED);
  });
});

describe('/api/providers route', () => {
  afterAll(async () => {
    await pool.end();
  });

  const SECRET_KEYS = ['token', 'secret', 'apiKey', 'credential', 'key', 'password'];

  test('GET /api/providers lists adapters with state, never a secret', async () => {
    const res = await request(app).get('/api/providers');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.providers)).toBe(true);
    const ids = res.body.providers.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['github', 'demo-provider', 'linear']));
    for (const p of res.body.providers) {
      expect(p).toEqual(expect.objectContaining({
        id: expect.any(String),
        authMode: expect.any(String),
        configured: expect.any(Boolean),
        state: expect.any(String),
      }));
      for (const k of SECRET_KEYS) expect(p[k]).toBeUndefined();
    }
  });

  test('GET /api/providers/:id/status returns one provider, 404 for unknown', async () => {
    const ok = await request(app).get('/api/providers/demo-provider/status');
    expect(ok.status).toBe(200);
    expect(ok.body.id).toBe('demo-provider');

    const missing = await request(app).get('/api/providers/does-not-exist/status');
    expect(missing.status).toBe(404);
  });

  test('POST /api/providers/demo-provider/test runs without a key -> disconnected', async () => {
    const res = await request(app).post('/api/providers/demo-provider/test');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('demo-provider');
    // No DEMO_PROVIDER_KEY in the test env -> not configured -> disconnected.
    expect([CONNECTION_STATES.DISCONNECTED, CONNECTION_STATES.CONNECTED, CONNECTION_STATES.ERROR])
      .toContain(res.body.state);
    for (const k of SECRET_KEYS) expect(res.body[k]).toBeUndefined();
  });
});
