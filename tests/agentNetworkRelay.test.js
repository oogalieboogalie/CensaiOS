// The relay groundwork (frontier part 6): the stand-in relay forwards a call
// to an install that is online, queues it while the install is off, and the
// install's relay link answers queued calls when it comes back. The install
// side answers through the same code as a direct call, so its signed
// receipt comes back with the answer.
import { jest } from '@jest/globals';
import { createMemoryStore } from './fixtures/agent-endpoints/memoryStore.js';

const memStore = createMemoryStore();
jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn(), on: jest.fn() } }));
jest.unstable_mockModule('../server/agentEndpoints/store.js', () => memStore);

const { createRelayStub, createRelayState } = await import('../server/agentNetwork/relayStub.js');
const { createRelayLink, relayUrlFromEnv } = await import('../server/agentNetwork/relayLink.js');
const { answerAgentCall, RECEIPT_META_KEY } = await import('../server/routes/agentEndpointsPublic.js');
const { createLimiter } = await import('../server/agentEndpoints/rateLimit.js');
const { generateIdentity, identitySigner } = await import('../server/agentNetwork/installIdentity.js');
const { recordEndpointReceipt } = await import('../server/agentNetwork/endpointReceipt.js');
const { buildAskRequest } = await import('../server/agentNetwork/askRequest.js');
const { verifyReceipt, receiptCovers } = await import('../server/agentNetwork/receipts.js');
const { relayAgentAddress } = await import('../server/agentNetwork/address.js');

const sam = identitySigner(generateIdentity());   // the install that shares Atlas
const alex = identitySigner(generateIdentity());  // the install that asks
const saved = [];
const shown = [];
const deps = {
  db: null,
  store: memStore,
  limiter: createLimiter(),
  runAgent: async ({ question, timings }) => {
    timings.model_calls.push({ tokens_in: 900, tokens_out: 60 });
    return `Atlas says: ${question.length} characters received`;
  },
  showOnBoard: async (endpoint, call) => { shown.push(call); },
  signReceipt: (args) => recordEndpointReceipt({ ...args, signer: sam, save: async (_db, row) => { saved.push(row); } }),
};

let server;
let relayUrl;
let endpoint;
let key;

beforeAll(async () => {
  endpoint = await memStore.upsertEndpoint(null, {
    userId: 1, workspaceId: 'ws-1', cardId: 'agent:atlas', agentId: 'atlas', agentName: 'Atlas', windowId: null,
  });
  await memStore.setEndpointEnabled(null, { userId: 1, endpointId: endpoint.id, enabled: true });
  ({ token: key } = await memStore.createToken(null, { endpointId: endpoint.id, label: "Alex's censaiOS" }));
  const app = createRelayStub({ state: createRelayState(), options: { holdMs: 3000, keepMs: 60_000, maxQueuedPerInstall: 5 } });
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  relayUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => new Promise((resolve) => { server.close(resolve); }));
beforeEach(() => { saved.length = 0; shown.length = 0; });

function link() {
  return createRelayLink({
    relayUrl,
    answer: (call) => answerAgentCall(call, deps),
    getSigner: async () => sam,
    sleep: async () => {},
  });
}

const address = () => relayAgentAddress({ relayUrl, installId: sam.installId, endpointId: endpoint.id });
const prompt = 'Write the migration that adds a status column to orders.';

async function ask(message = prompt, { signed = true } = {}) {
  const request = signed ? buildAskRequest({ signer: alex, id: 'help-1', agent: 'nexus', label: 'Nexus', to: address(), prompt: message }) : undefined;
  const res = await fetch(`${address()}/ask`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, request }),
  });
  return { status: res.status, body: await res.json() };
}

test('relay addresses come from the environment, off by default', () => {
  expect(relayUrlFromEnv({})).toBeNull();
  expect(relayUrlFromEnv({ CENSAI_AGENT_RELAY_URL: 'off' })).toBeNull();
  expect(relayUrlFromEnv({ CENSAI_AGENT_RELAY_URL: 'https://relay.censai.app/x' })).toBe('https://relay.censai.app');
});

test('a call to an install that is off is queued, then delivered when it comes back', async () => {
  const queued = await ask();
  expect(queued.status).toBe(202);
  expect(queued.body).toMatchObject({ queued: true });
  expect(queued.body.statusUrl).toBe(`${relayUrl}/relay/v1/calls/${queued.body.callId}`);

  // Only the caller's own key can look at the queued call.
  const stranger = await fetch(queued.body.statusUrl, { headers: { Authorization: 'Bearer cak_wrong' } });
  expect(stranger.status).toBe(404);
  const waiting = await (await fetch(queued.body.statusUrl, { headers: { Authorization: `Bearer ${key}` } })).json();
  expect(waiting).toMatchObject({ state: 'queued', online: false });

  // Sam's censaiOS opens: one round of its relay link answers the queued call.
  const delivered = await link().pollOnce({ wait: 0 });
  expect(delivered).toBe(1);

  const done = await (await fetch(queued.body.statusUrl, { headers: { Authorization: `Bearer ${key}` } })).json();
  expect(done).toMatchObject({ state: 'answered', status: 200 });
  expect(done.body.answer).toMatch(/^Atlas says/);
  const receipt = done.body.receipt;
  expect(verifyReceipt(receipt).ok).toBe(true);
  expect(receiptCovers(receipt, { prompt, answer: done.body.answer })).toBe(true);
  expect(receipt.body).toMatchObject({
    role: 'helper', channel: 'relay',
    asker: { install: alex.installId, agent: 'nexus', label: 'Nexus', verified: true },
    helper: { install: sam.installId, card: 'agent:atlas', label: 'Atlas' },
    cost: { tokensIn: 900, tokensOut: 60 },
  });
  expect(saved).toHaveLength(1);
  expect(shown[0]).toMatchObject({ asker: { verified: true, label: 'Nexus' }, receipt: { verified: true, channel: 'relay' } });
});

test('a computer that shuts down mid-wait does not swallow the next call', async () => {
  const { createRelayPass } = await import('../server/agentNetwork/relayPass.js');
  const hangUp = new AbortController();
  const stale = fetch(`${relayUrl}/relay/v1/inbox?wait=5`, {
    headers: { Authorization: `Bearer ${createRelayPass(sam, { relay: relayUrl })}` }, signal: hangUp.signal,
  }).catch(() => null);
  await new Promise((resolve) => { setTimeout(resolve, 100); });
  hangUp.abort();
  await stale;
  await new Promise((resolve) => { setTimeout(resolve, 50); });
  const queued = await ask('Still there?');
  expect(queued.status).toBe(202);
  // When the computer comes back, the call is waiting for it, not lost to the old connection.
  expect(await link().pollOnce({ wait: 0 })).toBe(1);
});

test('an install that is online answers straight through the relay', async () => {
  const l = link();
  const polling = l.pollOnce({ wait: 5 });
  await new Promise((resolve) => { setTimeout(resolve, 100); });
  const res = await ask('Add the index too.');
  await polling;
  expect(res.status).toBe(200);
  expect(res.body.answer).toMatch(/^Atlas says/);
  expect(verifyReceipt(res.body.receipt).ok).toBe(true);
});

test('a caller without a signed request is named by its key, not trusted as an install', async () => {
  const queued = await ask('Who am I?', { signed: false });
  await link().pollOnce({ wait: 0 });
  const done = await (await fetch(queued.body.statusUrl, { headers: { Authorization: `Bearer ${key}` } })).json();
  expect(done.body.receipt.body.asker).toMatchObject({ install: 'outside', verified: false, label: "Outside app (key \"Alex's censaiOS\")" });
});

test('the relay never vouches for keys: a wrong key is refused by the install', async () => {
  const res = await fetch(`${address()}/ask`, {
    method: 'POST',
    headers: { Authorization: 'Bearer cak_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'hi' }),
  });
  const { callId, statusUrl } = await res.json();
  expect(callId).toBeTruthy();
  await link().pollOnce({ wait: 0 });
  const done = await (await fetch(statusUrl, { headers: { Authorization: 'Bearer cak_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' } })).json();
  expect(done).toMatchObject({ state: 'answered', status: 401 });
});

test('only the install itself can collect or answer its calls', async () => {
  const noPass = await fetch(`${relayUrl}/relay/v1/inbox`);
  expect(noPass.status).toBe(401);
  const otherRelay = createRelayLink({
    relayUrl: 'http://127.0.0.1:1', answer: async () => ({ status: 200, body: {} }), getSigner: async () => sam,
  });
  // A pass made for another relay is refused here.
  const { createRelayPass } = await import('../server/agentNetwork/relayPass.js');
  const wrongAud = await fetch(`${relayUrl}/relay/v1/inbox`, {
    headers: { Authorization: `Bearer ${createRelayPass(sam, { relay: 'https://elsewhere.example' })}` },
  });
  expect(wrongAud.status).toBe(401);
  expect(otherRelay.status().connected).toBe(false);
  // Alex's install cannot answer a call queued for Sam's.
  const { body } = await ask('Is this mine?');
  const res = await fetch(`${relayUrl}/relay/v1/results/${body.callId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${createRelayPass(alex, { relay: relayUrl })}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 200, body: { answer: 'forged' } }),
  });
  expect(res.status).toBe(404);
  await link().pollOnce({ wait: 0 });
});

test('MCP calls through the relay need the install online, and carry the receipt in _meta', async () => {
  const neverOnline = relayAgentAddress({ relayUrl, installId: alex.installId, endpointId: endpoint.id });
  const offline = await fetch(neverOnline, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  expect(offline.status).toBe(503);
  expect((await offline.json()).error.message).toMatch(/computer is off/);

  const polling = link().pollOnce({ wait: 5 });
  const online = await fetch(address(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'ask_atlas', arguments: { message: 'Hello' } } }),
  });
  await polling;
  expect(online.status).toBe(200);
  const body = await online.json();
  expect(body.result.content[0].text).toMatch(/^Atlas says/);
  expect(verifyReceipt(body.result._meta[RECEIPT_META_KEY]).ok).toBe(true);
});
