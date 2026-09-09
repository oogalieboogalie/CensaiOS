// tests/agentRegistryClient.test.js
//
// Unit tests for src/lib/agentRegistry/client.js. The facade wraps
// D2 (REST) + D3 (WS) + durable workspace installs; we exercise:
//   - REST methods: listCards, getCard, createCard, updateCard, deleteCard
//     - query string encoding
//     - 204 → null
//     - non-2xx → Error with status + body
//   - durable workspace install/uninstall/list lifecycle
//   - WS delegation: subscribeToCard and callCard forward to the wsClient
//   - closeSocket + isReady delegation
//
// Both `fetch` and `wsFactory` are dependency-injected so tests don't
// need a real HTTP server or socket.

import { jest } from '@jest/globals';

const { createRegistryClient, INSTALLED_STORAGE_KEY } = await import('../src/lib/agentRegistry/client.js');

// ─── in-memory storage ──────────────────────────────────────────────────────

function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => map.clear(),
  };
}

// ─── fake fetch ──────────────────────────────────────────────────────────────

function makeFetch(handlers) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    const path = url.split('?')[0];
    const handler = handlers[path];
    if (!handler) throw new Error(`No fake handler for ${path}`);
    return handler({ url, init, calls });
  };
  return Object.assign(fetchImpl, { calls });
}

// ─── fake wsFactory ──────────────────────────────────────────────────────────

function makeWsFactory() {
  const created = [];
  const handlers = new Map(); // cardId → Set<handler>
  const fakeWs = {
    connect: jest.fn(),
    subscribe: jest.fn((cardId, handler) => {
      if (!handlers.has(cardId)) handlers.set(cardId, new Set());
      handlers.get(cardId).add(handler);
      return () => handlers.get(cardId)?.delete(handler);
    }),
    call: jest.fn((cardId, payload, options) => {
      const events = [
        { type: 'call.started', taskId: 't-1' },
        { type: 'call.event', taskId: 't-1', stage: 'plan' },
        { type: 'call.complete', taskId: 't-1', result: { ok: true } },
      ];
      return (async function* () {
        for (const ev of events) yield ev;
      })();
    }),
    isReady: jest.fn(() => true),
    close: jest.fn(),
  };
  const factory = jest.fn((opts) => {
    created.push({ opts, ws: fakeWs });
    return fakeWs;
  });
  return { factory, ws: fakeWs, created, handlers };
}

// ─── tests ──────────────────────────────────────────────────────────────────

describe('createRegistryClient — REST surface', () => {
  test('listCards sends GET /cards and decodes { items, total, limit, offset }', async () => {
    const payload = { items: [{ id: 'agent:architect', name: 'Architect' }], total: 1, limit: 50, offset: 0 };
    const fetchImpl = makeFetch({
      '/api/agent-registry/cards': () => ({ ok: true, status: 200, json: async () => payload }),
    });
    const client = createRegistryClient({ fetch: fetchImpl, storage: makeStorage(), wsFactory: () => ({}) });
    const result = await client.listCards({ visibility: 'public', limit: 50 });
    expect(result).toEqual(payload);
    expect(fetchImpl.calls[0].url).toContain('/api/agent-registry/cards');
    expect(fetchImpl.calls[0].url).toContain('visibility=public');
    expect(fetchImpl.calls[0].url).toContain('limit=50');
    expect(fetchImpl.calls[0].init.method).toBeUndefined();
    expect(fetchImpl.calls[0].init.credentials).toBe('same-origin');
  });

  test('listCards omits empty query params', async () => {
    const fetchImpl = makeFetch({
      '/api/agent-registry/cards': () => ({ ok: true, status: 200, json: async () => ({ items: [], total: 0, limit: 20, offset: 0 }) }),
    });
    const client = createRegistryClient({ fetch: fetchImpl, storage: makeStorage(), wsFactory: () => ({}) });
    await client.listCards();
    expect(fetchImpl.calls[0].url).toBe('/api/agent-registry/cards');
  });

  test('getCard encodes the id and returns the card', async () => {
    const card = { id: 'ext:1:abc', name: 'X' };
    const fetchImpl = makeFetch({
      '/api/agent-registry/cards/ext%3A1%3Aabc': () => ({ ok: true, status: 200, json: async () => card }),
    });
    const client = createRegistryClient({ fetch: fetchImpl, storage: makeStorage(), wsFactory: () => ({}) });
    const out = await client.getCard('ext:1:abc');
    expect(out).toEqual(card);
  });

  test('getCard throws when id is missing', async () => {
    const client = createRegistryClient({ fetch: makeFetch({}), storage: makeStorage(), wsFactory: () => ({}) });
    await expect(client.getCard()).rejects.toThrow(TypeError);
    await expect(client.getCard('')).rejects.toThrow(TypeError);
  });

  test('createCard sends POST with JSON body', async () => {
    const created = { id: 'ext:1:new', name: 'New' };
    const fetchImpl = makeFetch({
      '/api/agent-registry/cards': ({ init }) => {
        expect(init.method).toBe('POST');
        expect(init.headers['Content-Type']).toBe('application/json');
        // The facade passes the body verbatim — visibility defaults happen
        // server-side in D2's createCard handler.
        expect(JSON.parse(init.body)).toEqual({ name: 'New', workspaceId: 'ws-owner' });
        return { ok: true, status: 201, json: async () => created };
      },
    });
    const client = createRegistryClient({
      fetch: fetchImpl, storage: makeStorage(), wsFactory: () => ({}), workspaceId: 'ws-owner',
    });
    const out = await client.createCard({ name: 'New' });
    expect(out).toEqual(created);
  });

  test('active workspace scopes list and replaces spoofed create ownership input', async () => {
    const fetchImpl = makeFetch({
      '/api/agent-registry/cards': ({ url, init }) => {
        if (!init.method) {
          expect(url).toContain('workspace_id=ws-owner');
          return { ok: true, status: 200, json: async () => ({ items: [], total: 0 }) };
        }
        expect(JSON.parse(init.body)).toEqual({
          name: 'Scoped', workspaceId: 'ws-owner', workspace_id: 'ws-foreign', owner_id: 'attacker',
        });
        return { ok: true, status: 201, json: async () => ({ id: 'ext:7:scoped' }) };
      },
    });
    const client = createRegistryClient({
      fetch: fetchImpl, storage: makeStorage(), wsFactory: () => ({}), workspaceId: 'ws-owner',
    });
    await client.listCards();
    await client.createCard({ name: 'Scoped', workspace_id: 'ws-foreign', owner_id: 'attacker' });
  });

  test('updateCard strips the path through PATCH', async () => {
    const fetchImpl = makeFetch({
      '/api/agent-registry/cards/agent%3Aarchitect': ({ init }) => {
        expect(init.method).toBe('PATCH');
        expect(JSON.parse(init.body)).toEqual({ description: 'updated' });
        return { ok: true, status: 200, json: async () => ({ id: 'agent:architect', description: 'updated' }) };
      },
    });
    const client = createRegistryClient({ fetch: fetchImpl, storage: makeStorage(), wsFactory: () => ({}) });
    const out = await client.updateCard('agent:architect', { description: 'updated' });
    expect(out.description).toBe('updated');
  });

  test('deleteCard returns null on 204 and calls DELETE', async () => {
    const fetchImpl = makeFetch({
      '/api/agent-registry/cards/agent%3Aarchitect': ({ init }) => {
        expect(init.method).toBe('DELETE');
        return { ok: true, status: 204, json: async () => { throw new SyntaxError('empty body'); } };
      },
    });
    const client = createRegistryClient({ fetch: fetchImpl, storage: makeStorage(), wsFactory: () => ({}) });
    const out = await client.deleteCard('agent:architect');
    expect(out).toBeNull();
  });

  test('non-2xx surfaces an Error with status and body', async () => {
    const fetchImpl = makeFetch({
      '/api/agent-registry/cards/agent%3Aarchitect': () => ({ ok: false, status: 404, json: async () => ({ error: 'Card not found' }) }),
    });
    const client = createRegistryClient({ fetch: fetchImpl, storage: makeStorage(), wsFactory: () => ({}) });
    try {
      await client.getCard('agent:architect');
      throw new Error('expected throw');
    } catch (err) {
      expect(err.message).toBe('Card not found');
      expect(err.status).toBe(404);
      expect(err.body).toEqual({ error: 'Card not found' });
    }
  });

  test('missing fetch in non-browser environments throws', async () => {
    const savedFetch = globalThis.fetch;
    try {
      delete globalThis.fetch;
      expect(() => createRegistryClient({ storage: makeStorage(), wsFactory: () => ({}) })).toThrow(/no fetch available/);
    } finally {
      if (savedFetch !== undefined) globalThis.fetch = savedFetch;
    }
  });
});

describe('createRegistryClient — durable install set', () => {
  test('installCard + listInstalled use the workspace server surface', async () => {
    const fetchImpl = makeFetch({
      '/api/agent-registry/installs/agent%3Aarchitect': () => ({
        ok: true, status: 201, json: async () => ({ created: true }),
      }),
      '/api/agent-registry/installs': () => ({
        ok: true, status: 200, json: async () => ({ canManage: true, items: [{
          card_id: 'agent:architect', installed_at: '2026-07-14T00:00:00Z', installed_by_user_id: '7',
        }] }),
      }),
    });
    const client = createRegistryClient({ fetch: fetchImpl, wsFactory: () => ({}), workspaceId: 'ws-owner' });
    await client.installCard('agent:architect');
    const result = await client.listInstalled();
    expect(result.canManage).toBe(true);
    expect(result.installed['agent:architect']).toEqual({
      installedAt: '2026-07-14T00:00:00Z', installedByUserId: '7',
    });
  });

  test('installCard leaves the legacy storage key untouched', async () => {
    const storage = makeStorage();
    storage.setItem(INSTALLED_STORAGE_KEY, '{"legacy":true}');
    const fetchImpl = makeFetch({
      '/api/agent-registry/installs/agent%3Aarchitect': () => ({ ok: true, status: 201, json: async () => ({}) }),
    });
    const client = createRegistryClient({ fetch: fetchImpl, storage, wsFactory: () => ({}), workspaceId: 'ws-owner' });
    await client.installCard('agent:architect');
    expect(storage.getItem(INSTALLED_STORAGE_KEY)).toBe('{"legacy":true}');
  });

  test('list does not hydrate stale legacy storage', async () => {
    const storage = makeStorage();
    storage.setItem(INSTALLED_STORAGE_KEY, JSON.stringify({
      'agent:censai': { installedAt: '2026-01-01T00:00:00Z', settings: { hue: 145 } },
    }));
    const fetchImpl = makeFetch({
      '/api/agent-registry/installs': () => ({
        ok: true, status: 200, json: async () => ({ canManage: true, items: [] }),
      }),
    });
    const client = createRegistryClient({ fetch: fetchImpl, storage, wsFactory: () => ({}), workspaceId: 'ws-owner' });
    expect((await client.listInstalled()).installed).toEqual({});
  });

  test('uninstallCard uses DELETE with the configured workspace', async () => {
    const fetchImpl = makeFetch({
      '/api/agent-registry/installs/agent%3Aarchitect': ({ init, url }) => {
        expect(init.method).toBe('DELETE');
        expect(url).toContain('workspaceId=ws-owner');
        return { ok: true, status: 200, json: async () => ({ removed: true }) };
      },
    });
    const client = createRegistryClient({ fetch: fetchImpl, wsFactory: () => ({}), workspaceId: 'ws-owner' });
    await expect(client.uninstallCard('agent:architect')).resolves.toEqual({ removed: true });
  });

  test('installed snapshots are frozen', async () => {
    const fetchImpl = makeFetch({
      '/api/agent-registry/installs': () => ({ ok: true, status: 200, json: async () => ({
        canManage: false, items: [{ card_id: 'agent:architect', installed_at: 'now' }],
      }) }),
    });
    const client = createRegistryClient({ fetch: fetchImpl, wsFactory: () => ({}), workspaceId: 'ws-owner' });
    const { installed } = await client.listInstalled();
    expect(Object.isFrozen(installed)).toBe(true);
    expect(Object.isFrozen(installed['agent:architect'])).toBe(true);
  });

  test('installCard rejects without cardId before fetch', async () => {
    const client = createRegistryClient({ fetch: makeFetch({}), wsFactory: () => ({}), workspaceId: 'ws-owner' });
    await expect(client.installCard('')).rejects.toThrow(/cardId is required/);
  });

  test('uninstallCard rejects without cardId before fetch', async () => {
    const client = createRegistryClient({ fetch: makeFetch({}), wsFactory: () => ({}), workspaceId: 'ws-owner' });
    await expect(client.uninstallCard()).rejects.toThrow(/cardId is required/);
  });

  test('install API errors expose status and body', async () => {
    const fetchImpl = makeFetch({
      '/api/agent-registry/installs/agent%3Aarchitect': () => ({
        ok: false, status: 403, json: async () => ({ error: 'Owner required', code: 'FORBIDDEN' }),
      }),
    });
    const client = createRegistryClient({ fetch: fetchImpl, wsFactory: () => ({}), workspaceId: 'ws-owner' });
    await expect(client.installCard('agent:architect')).rejects.toMatchObject({
      message: 'Owner required', status: 403, body: { error: 'Owner required', code: 'FORBIDDEN' },
    });
  });

  test('durable client never clears legacy storage', async () => {
    const storage = makeStorage();
    storage.setItem(INSTALLED_STORAGE_KEY, '{not valid');
    const fetchImpl = makeFetch({
      '/api/agent-registry/installs': () => ({
        ok: true, status: 200, json: async () => ({ canManage: true, items: [] }),
      }),
    });
    const client = createRegistryClient({ fetch: fetchImpl, storage, wsFactory: () => ({}), workspaceId: 'ws-owner' });
    await client.listInstalled();
    expect(storage.getItem(INSTALLED_STORAGE_KEY)).toBe('{not valid');
  });

  test('explicit missing workspace blocks install, publish, and call', () => {
    const { factory } = makeWsFactory();
    const client = createRegistryClient({ fetch: makeFetch({}), storage: makeStorage(), wsFactory: factory, workspaceId: null });
    expect(() => client.installCard('agent:architect')).toThrow(/open a workspace/i);
    expect(() => client.listInstalled()).toThrow(/open a workspace/i);
    expect(() => client.createCard({ name: 'Nope' })).toThrow(/open a workspace/i);
    expect(() => client.callCard('agent:architect', { message: 'Nope' })).toThrow(/open a workspace/i);
  });
});

describe('createRegistryClient — WS delegation', () => {
  test('subscribeToCard forwards to wsClient and triggers connect first', () => {
    const { factory, ws } = makeWsFactory();
    const client = createRegistryClient({
      fetch: makeFetch({}), storage: makeStorage(), wsFactory: factory, workspaceId: 'ws-owner',
    });
    const off = client.subscribeToCard('agent:architect', () => {});
    expect(ws.connect).toHaveBeenCalledTimes(1);
    expect(ws.subscribe).toHaveBeenCalledWith('agent:architect', expect.any(Function));
    expect(typeof off).toBe('function');
  });

  test('callCard returns the AsyncIterable from wsClient.call and triggers connect', async () => {
    const { factory, ws } = makeWsFactory();
    const client = createRegistryClient({
      fetch: makeFetch({}), storage: makeStorage(), wsFactory: factory, workspaceId: 'ws-owner',
    });
    const iter = client.callCard('agent:architect', { msg: 'hi' });
    expect(ws.connect).toHaveBeenCalled();
    const events = [];
    for await (const ev of iter) events.push(ev);
    expect(events.map((e) => e.type)).toEqual(['call.started', 'call.event', 'call.complete']);
  });

  test('callCard replaces caller workspace options with the active workspace', () => {
    const { factory, ws } = makeWsFactory();
    const client = createRegistryClient({
      fetch: makeFetch({}), storage: makeStorage(), wsFactory: factory, workspaceId: 'ws-owner',
    });
    client.callCard('agent:architect', { msg: 'hi' }, { workspaceId: 'ws-foreign', trace: true });
    expect(ws.call).toHaveBeenCalledWith(
      'agent:architect', { msg: 'hi' }, { workspaceId: 'ws-owner', trace: true }
    );
  });

  test('isReady and closeSocket delegate to wsClient', () => {
    const { factory, ws } = makeWsFactory();
    const client = createRegistryClient({ fetch: makeFetch({}), storage: makeStorage(), wsFactory: factory });
    expect(client.isReady()).toBe(true);
    client.closeSocket();
    expect(ws.close).toHaveBeenCalled();
  });
});
