// Asking an agent on another censaiOS (frontier part 6): the run sends a
// signed request, checks the other install's signed receipt, keeps both,
// and waits in the queue while a relay holds the call for a computer that
// is off.
import { jest } from '@jest/globals';

const completeRun = jest.fn();
const failRun = jest.fn();
const recordRunAction = jest.fn();
const deferAgentCardRun = jest.fn();
const insertReceipt = jest.fn();
jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn(), on: jest.fn() } }));
jest.unstable_mockModule('../server/runs/lifecycle.js', () => ({ completeRun, failRun, recordRunAction }));
jest.unstable_mockModule('../server/agent-card-runs/defer.js', () => ({ deferAgentCardRun }));
jest.unstable_mockModule('../server/agent-card-runs/events.js', () => ({ publishAgentCardEvent: jest.fn() }));
jest.unstable_mockModule('../server/agentNetwork/receiptStore.js', () => ({ insertReceipt }));

const { executeCensaiAgentCardRun } = await import('../server/agent-card-runs/executors/censai.js');
const { resolveAgentCardExecutor } = await import('../server/agent-card-runs/contract.js');
const { __test__: importTest, vaultProvider, agentFromTool } = await import('../server/agent-registry/adapters/censaiImport.js');
const { generateIdentity, identitySigner } = await import('../server/agentNetwork/installIdentity.js');
const { buildReceiptBody, signReceipt, verifyReceipt } = await import('../server/agentNetwork/receipts.js');
const { verifyAskRequest } = await import('../server/agentNetwork/askRequest.js');
const { encryptKey } = await import('../server/security/vault.js');

const alma = identitySigner(generateIdentity());
const sam = identitySigner(generateIdentity());
const KEY = 'cak_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const ENDPOINT = '598a4fb7-a3b1-4f0d-b304-042cf9fdd695';
const address = `http://127.0.0.1:8787/i/${sam.installId}/api/mcp/agents/${ENDPOINT}`;
const inspected = {
  kind: 'censai', protocolVersion: 'censai-ask-v1', endpoint: address, installId: sam.installId,
  endpointId: ENDPOINT, viaRelay: true, sourceDigest: 'd'.repeat(64),
};
const card = {
  id: importTest.importedCardId('ws-1', ENDPOINT), name: "Sam's Atlas", owner_id: '1', workspace_id: 'ws-1',
  endpoint: address, auth: { type: 'bearer' }, metadata: importTest.importMetadata(inspected),
};
const db = {
  query: jest.fn(async (sql, params) => (/user_api_keys/.test(sql) && params[1] === vaultProvider(card.id)
    ? { rows: [{ api_key_encrypted: encryptKey(KEY, 1) }] } : { rows: [] })),
};
const prompt = '[Help request via the Censai agent network]\nTask:\nWrite the migration.';
const run = (metadata = {}) => ({
  id: 'run-1', started_at: '2026-10-12T05:00:00.000Z',
  metadata: { prompt, helpRequestId: 'help-1', workspaceId: 'ws-1', requester: { kind: 'agent', id: 'nexus' }, ...metadata },
});

function helperReceipt(answer, signer = sam, question = prompt) {
  return signReceipt(buildReceiptBody({
    role: 'helper', channel: 'relay', requestRef: 'x', signer, helper: { card: 'agent:atlas', label: 'Atlas' },
    asker: { install: alma.installId, agent: 'nexus', label: 'Nexus', verified: true },
    outcome: 'completed', startedAt: new Date(), finishedAt: new Date(), tokensIn: 1700, tokensOut: 46, prompt: question, answer,
  }, signer), signer);
}

function json(status, body) {
  return { status, ok: status < 300, json: async () => body };
}

const options = (fetchImpl) => ({ card, db, fetchImpl, getSigner: async () => alma, recheckMs: 2000 });

beforeEach(() => { jest.clearAllMocks(); });

test('an imported censaiOS agent resolves to the censai executor, and only with a bearer key', () => {
  expect(resolveAgentCardExecutor(card)).toMatchObject({ kind: 'censai', endpoint: address });
  expect(() => resolveAgentCardExecutor({ ...card, auth: { type: 'none' } })).toThrow();
  expect(vaultProvider(card.id).length).toBeLessThanOrEqual(50);
  expect(agentFromTool({ name: 'ask_atlas', title: 'Ask Atlas' }).name).toBe('Atlas');
});

test('a direct answer completes the run and keeps both signed receipts', async () => {
  const answer = 'ALTER TABLE orders ADD COLUMN status text;';
  const fetchImpl = jest.fn(async (url, init) => {
    expect(url.toString()).toBe(`${address}/ask`);
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
    const body = JSON.parse(init.body);
    expect(verifyAskRequest(body.request, { prompt: body.message })).toMatchObject({ ok: true, install: alma.installId, agent: 'nexus' });
    return json(200, { agent: 'Atlas', answer, receipt: helperReceipt(answer) });
  });
  const outcome = await executeCensaiAgentCardRun(run(), card.metadata.executor && resolveAgentCardExecutor(card), options(fetchImpl));
  expect(outcome).toEqual({ status: 'succeeded', result: answer });
  expect(completeRun).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ result: answer, counterVerified: true }) }));
  const saved = insertReceipt.mock.calls[0][1];
  expect(saved).toMatchObject({ workspaceId: 'ws-1', helpRequestId: 'help-1' });
  expect(verifyReceipt(saved.receipt).ok).toBe(true);
  expect(saved.receipt.body).toMatchObject({
    role: 'asker', channel: 'relay', request: 'help-1', outcome: 'completed',
    asker: { install: alma.installId, agent: 'nexus' }, helper: { install: sam.installId, card: card.id, label: "Sam's Atlas" },
    cost: { tokensIn: 1700, tokensOut: 46 },
  });
  expect(saved.counterReceipt.body.signer.install).toBe(sam.installId);
});

test('a receipt that does not match the answer is kept but not trusted for cost', async () => {
  const fetchImpl = jest.fn(async () => json(200, { answer: 'The real answer', receipt: helperReceipt('A different answer') }));
  await executeCensaiAgentCardRun(run(), resolveAgentCardExecutor(card), options(fetchImpl));
  expect(completeRun).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ counterVerified: false }) }));
  expect(insertReceipt.mock.calls[0][1].receipt.body.cost).toEqual({ tokensIn: 0, tokensOut: 0, price: null });
});

test('a call queued at the relay waits in the run queue, then completes when answered', async () => {
  const statusUrl = 'http://127.0.0.1:8787/relay/v1/calls/rc_1';
  const queued = jest.fn(async () => json(202, { queued: true, callId: 'rc_1', statusUrl }));
  expect(await executeCensaiAgentCardRun(run(), resolveAgentCardExecutor(card), options(queued))).toEqual({ status: 'waiting' });
  const patch = deferAgentCardRun.mock.calls[0][0];
  expect(patch).toMatchObject({ runId: 'run-1', delayMs: 2000, patch: { relayCall: { callId: 'rc_1', statusUrl } } });
  expect(completeRun).not.toHaveBeenCalled();

  const relayCall = patch.patch.relayCall;
  const stillQueued = jest.fn(async () => json(200, { state: 'queued', online: false }));
  expect(await executeCensaiAgentCardRun(run({ relayCall }), resolveAgentCardExecutor(card), options(stillQueued))).toEqual({ status: 'waiting' });
  expect(stillQueued.mock.calls[0][0].toString()).toBe(statusUrl);

  const answer = 'CREATE INDEX CONCURRENTLY ...';
  const answered = jest.fn(async () => json(200, { state: 'answered', status: 200, body: { answer, receipt: helperReceipt(answer) } }));
  expect(await executeCensaiAgentCardRun(run({ relayCall }), resolveAgentCardExecutor(card), options(answered))).toEqual({ status: 'succeeded', result: answer });
  expect(insertReceipt.mock.calls[0][1].receipt.body.startedAt).toBe(new Date(relayCall.sentAt).toISOString());
});

test('a refused call fails the run and still leaves a failed receipt', async () => {
  const fetchImpl = jest.fn(async () => json(401, { error: 'A valid agent key is required.' }));
  const outcome = await executeCensaiAgentCardRun(run(), resolveAgentCardExecutor(card), options(fetchImpl));
  expect(outcome.status).toBe('failed');
  expect(outcome.error).toMatch(/A valid agent key is required/);
  expect(failRun).toHaveBeenCalled();
  expect(insertReceipt.mock.calls[0][1].receipt.body).toMatchObject({ role: 'asker', outcome: 'failed', answerSha256: null });
});

test('a missing key fails before anything is sent', async () => {
  const fetchImpl = jest.fn();
  const noKeyDb = { query: jest.fn(async () => ({ rows: [] })) };
  const outcome = await executeCensaiAgentCardRun(run(), resolveAgentCardExecutor(card), { ...options(fetchImpl), db: noKeyDb });
  expect(outcome.error).toMatch(/key for this agent is missing/);
  expect(fetchImpl).not.toHaveBeenCalled();
});
