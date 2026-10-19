import { jest } from '@jest/globals';

// A message to a hosted agent goes to its vendor with the person's own key,
// and the vendor's conversation id is remembered per person and chat.

const { runHostedTurn, lastAsk, conversationKeyFor, keyFor } = await import('../server/hostedAgents/runTurn.js');
const { publicChatError } = await import('../server/routes/chat/httpErrors.js');

function fakeDb(threads = new Map()) {
  return {
    threads,
    query: jest.fn(async (sql, params) => {
      if (/FROM hosted_agent_threads/.test(sql)) {
        return { rows: threads.has(params.join('|')) ? [{ remote_thread: threads.get(params.join('|')) }] : [] };
      }
      if (/INSERT INTO hosted_agent_threads/.test(sql)) {
        threads.set(params.slice(0, 3).join('|'), params[3]);
        return { rows: [] };
      }
      return { rows: [] };
    }),
  };
}

const presence = async () => ({ finish: () => {}, wrap: (fn) => fn });
const checkAccess = async () => {};

function fakeVendor(answers) {
  return {
    id: 'anthropic', label: 'Claude', keyProvider: 'anthropic', keyLabel: 'Anthropic API key', billedBy: 'Anthropic',
    send: jest.fn(async ({ thread, text }) => answers({ thread, text })),
  };
}

const HOSTED = { agent_id: 'front-desk', vendor: 'anthropic', remote_ref: 'agent_FAKE01', endpoint: null, settings: {} };

describe('runHostedTurn', () => {
  test('sends the last message with the person own key, keeps the vendor conversation', async () => {
    const vendor = fakeVendor(({ thread, text }) => ({ text: `echo ${text} on ${thread || 'new'}`, thread: thread || 'sesn_FAKE1' }));
    const db = fakeDb();
    const vault = jest.fn(async (userId, provider) => (userId === 7 && provider === 'anthropic' ? { apiKey: 'sk-ant-sam-own' } : null));
    const base = { hosted: HOSTED, agentId: 'front-desk', userId: 7, windowId: 'w-chat', db, vault, presence, checkAccess, pickVendor: () => vendor };
    const first = await runHostedTurn({ ...base, messages: [{ from: 'me', text: 'Hi there' }] });
    expect(first.finalText).toBe('echo Hi there on new');
    expect(vendor.send.mock.calls[0][0]).toMatchObject({ apiKey: 'sk-ant-sam-own', ref: 'agent_FAKE01', thread: null });
    const second = await runHostedTurn({ ...base, messages: [{ from: 'me', text: 'Hi there' }, { from: 'front-desk', text: 'x' }, { from: 'me', text: 'Again' }] });
    expect(second.finalText).toBe('echo Again on sesn_FAKE1');
    expect(second.toolActions).toEqual([]);
  });

  test('outside apps and other agents never share a vendor conversation', async () => {
    const vendor = fakeVendor(({ thread }) => ({ text: thread || 'fresh', thread: 'sesn_X' }));
    const db = fakeDb(new Map([['front-desk|7|endpoint', 'sesn_OLD']]));
    const base = { hosted: HOSTED, agentId: 'front-desk', userId: 7, db, vault: async () => ({ apiKey: 'k' }), presence, checkAccess, pickVendor: () => vendor };
    const first = await runHostedTurn({ ...base, origin: 'endpoint', messages: [{ from: 'me', text: 'a' }] });
    const second = await runHostedTurn({ ...base, origin: 'endpoint', messages: [{ from: 'me', text: 'b' }] });
    expect([first.finalText, second.finalText]).toEqual(['fresh', 'fresh']);
    expect(db.query.mock.calls.some(([sql]) => /hosted_agent_threads/.test(sql))).toBe(false);
  });

  test('a dead vendor conversation is replaced by a fresh one', async () => {
    const vendor = fakeVendor(({ thread }) => {
      if (thread === 'sesn_DEAD') throw Object.assign(new Error('closed'), { code: 'HOSTED_AGENT_REJECTED' });
      return { text: 'back', thread: 'sesn_NEW' };
    });
    const db = fakeDb(new Map([['front-desk|7|w1', 'sesn_DEAD']]));
    const out = await runHostedTurn({ hosted: HOSTED, agentId: 'front-desk', userId: 7, windowId: 'w1', messages: [{ from: 'me', text: 'hi' }], db, vault: async () => ({ apiKey: 'k' }), presence, checkAccess, pickVendor: () => vendor });
    expect(out.finalText).toBe('back');
    expect(db.threads.get('front-desk|7|w1')).toBe('sesn_NEW');
  });

  test('the same access rule as every agent runs first', async () => {
    const vendor = fakeVendor(() => ({ text: 'never' }));
    const deny = async () => { throw Object.assign(new Error('Agent not found.'), { statusCode: 404 }); };
    await expect(runHostedTurn({ hosted: HOSTED, agentId: 'front-desk', userId: 7, messages: [{ from: 'me', text: 'hi' }], db: fakeDb(), vault: async () => ({ apiKey: 'k' }), presence, checkAccess: deny, pickVendor: () => vendor }))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(vendor.send).not.toHaveBeenCalled();
  });

  test('no saved key: a plain message naming the key and who bills', async () => {
    const vendor = fakeVendor(() => ({ text: 'never' }));
    const err = await runHostedTurn({
      hosted: HOSTED, agentId: 'front-desk', userId: 8, messages: [{ from: 'me', text: 'hello' }],
      db: fakeDb(), vault: async () => null, presence, checkAccess, pickVendor: () => vendor,
    }).catch((e) => e);
    expect(err.code).toBe('HOSTED_AGENT_KEY_REQUIRED');
    expect(err.statusCode).toBe(403);
    expect(err.message).toMatch(/Settings → Vault.*billed by Anthropic/);
    expect(vendor.send).not.toHaveBeenCalled();
    // The chat window shows the message as written.
    expect(publicChatError(err).body.message).toBe(err.message);
  });

  test('a teammate without a key never borrows the importer key', async () => {
    await expect(keyFor({ keyProvider: 'anthropic', keyLabel: 'Anthropic API key', billedBy: 'Anthropic' }, null, { vault: async () => ({ apiKey: 'owner' }) }))
      .rejects.toMatchObject({ code: 'HOSTED_AGENT_KEY_REQUIRED' });
  });

  test('helpers', () => {
    expect(lastAsk([{ from: 'system', text: 'note' }, { from: 'me', text: ' q ' }])).toBe('q');
    expect(conversationKeyFor({ origin: 'help' })).toBe('help');
    expect(conversationKeyFor({ conversationId: 'c1', windowId: 'w1' })).toBe('c1');
  });
});
