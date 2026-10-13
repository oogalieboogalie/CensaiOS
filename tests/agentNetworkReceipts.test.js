// Agent network receipts (frontier part 6): signed receipts, signed ask
// requests, relay passes and agent addresses. Pure code, no database.
import {
  generateIdentity, identitySigner, installIdFor, isInstallId, verifySignature,
} from '../server/agentNetwork/installIdentity.js';
import { canonicalJson, sha256Hex } from '../server/agentNetwork/canonical.js';
import {
  buildReceiptBody, cardPrice, receiptCovers, receiptSummary, signReceipt, tokensFromTimings, verifyReceipt,
} from '../server/agentNetwork/receipts.js';
import { buildAskRequest, verifyAskRequest } from '../server/agentNetwork/askRequest.js';
import { createRelayPass, verifyRelayPass } from '../server/agentNetwork/relayPass.js';
import { parseAgentAddress, relayAgentAddress } from '../server/agentNetwork/address.js';

const alex = identitySigner(generateIdentity());
const sam = identitySigner(generateIdentity());
const ENDPOINT = '598a4fb7-a3b1-4f0d-b304-042cf9fdd695';

function receipt(overrides = {}, signer = sam) {
  return signReceipt(buildReceiptBody({
    role: 'helper', channel: 'relay', requestRef: 'req-1', signer,
    asker: { install: alex.installId, agent: 'nexus', label: 'Nexus', verified: true },
    helper: { card: 'agent:atlas', label: 'Atlas' },
    outcome: 'completed', startedAt: '2026-10-12T05:00:00.000Z', finishedAt: '2026-10-12T05:00:04.200Z',
    tokensIn: 1200, tokensOut: 80, prompt: 'Write the migration.', answer: 'ALTER TABLE ...',
    ...overrides,
  }, signer), signer);
}

describe('install identity', () => {
  test('the install id is a fingerprint of the public key', () => {
    expect(isInstallId(alex.installId)).toBe(true);
    expect(installIdFor(alex.publicKey)).toBe(alex.installId);
    expect(alex.installId).not.toBe(sam.installId);
  });

  test('signatures check out only for the signed bytes and the signing key', () => {
    const sig = alex.sign('hello');
    expect(verifySignature('hello', sig, alex.publicKey)).toBe(true);
    expect(verifySignature('hello!', sig, alex.publicKey)).toBe(false);
    expect(verifySignature('hello', sig, sam.publicKey)).toBe(false);
    expect(verifySignature('hello', 'garbage', 'not-a-key')).toBe(false);
  });
});

describe('receipts', () => {
  test('canonical JSON sorts keys so both installs sign the same bytes', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 1, e: 0 }] }, x: undefined }))
      .toBe('{"a":{"c":[3,{"e":0,"f":1}],"d":2},"b":1}');
  });

  test('a signed receipt verifies and keeps hashes, never the words', () => {
    const r = receipt();
    expect(verifyReceipt(r)).toEqual({ ok: true, reason: null });
    expect(r.body.promptSha256).toBe(sha256Hex('Write the migration.'));
    expect(JSON.stringify(r)).not.toContain('Write the migration');
    expect(JSON.stringify(r)).not.toContain('ALTER TABLE');
    expect(r.body.durationMs).toBe(4200);
    expect(r.body.cost).toEqual({ tokensIn: 1200, tokensOut: 80, price: null });
    expect(r.body.signer).toEqual({ install: sam.installId, publicKey: sam.publicKey });
  });

  test('editing any field after signing breaks the signature', () => {
    const r = receipt();
    const edited = { ...r, body: { ...r.body, cost: { ...r.body.cost, tokensIn: 1 } } };
    expect(verifyReceipt(edited)).toEqual({ ok: false, reason: 'signature does not match' });
  });

  test('a receipt cannot claim another install', () => {
    const r = receipt();
    const forged = { ...r, body: { ...r.body, signer: { install: alex.installId, publicKey: sam.publicKey } } };
    expect(verifyReceipt(forged).reason).toBe('install id does not match its key');
    expect(verifyReceipt(null).ok).toBe(false);
  });

  test('receiptCovers ties a receipt to the exact question and answer', () => {
    const r = receipt();
    expect(receiptCovers(r, { prompt: 'Write the migration.', answer: 'ALTER TABLE ...' })).toBe(true);
    expect(receiptCovers(r, { prompt: 'Something else' })).toBe(false);
    expect(receiptCovers(r, { answer: 'A different answer' })).toBe(false);
  });

  test('tokens add up across model calls and prices come from the card', () => {
    expect(tokensFromTimings({ model_calls: [{ tokens_in: 10, tokens_out: 5 }, { tokens_in: 7 }, {}] }))
      .toEqual({ tokensIn: 17, tokensOut: 5 });
    expect(tokensFromTimings(null)).toEqual({ tokensIn: 0, tokensOut: 0 });
    expect(cardPrice({ metadata: { marketplace: { priceCents: 25 } } })).toEqual({ cents: 25, currency: 'USD' });
    expect(cardPrice({ metadata: {} })).toBeNull();
    expect(receipt({ price: { cents: 25, currency: 'USD' } }).body.cost.price).toEqual({ cents: 25, currency: 'USD' });
  });

  test('the summary carried by chat messages and help cards', () => {
    expect(receiptSummary(receipt(), { counterVerified: true })).toMatchObject({
      role: 'helper', channel: 'relay', outcome: 'completed', durationMs: 4200, tokens: 1280,
      signedBy: sam.installId, verified: true, counterVerified: true,
    });
  });

  test('unknown roles and channels are refused', () => {
    expect(() => receipt({ role: 'boss' })).toThrow(/role/);
    expect(() => receipt({ channel: 'pigeon' })).toThrow(/channel/);
  });
});

describe('signed ask requests', () => {
  const ask = (prompt = 'Write the migration.') => buildAskRequest({
    signer: alex, id: 'help-1', agent: 'nexus', label: 'Nexus', to: 'https://relay/x', prompt,
  });

  test('the helper can prove who asked and that it is the same question', () => {
    expect(verifyAskRequest(ask(), { prompt: 'Write the migration.' })).toMatchObject({
      ok: true, install: alex.installId, agent: 'nexus', label: 'Nexus', id: 'help-1',
    });
  });

  test('a request signed for another question, edited, or too old is unverified', () => {
    expect(verifyAskRequest(ask(), { prompt: 'Drop the table.' }).reason).toBe('signed for a different question');
    const edited = ask();
    edited.body.from.label = 'Somebody else';
    expect(verifyAskRequest(edited, { prompt: 'Write the migration.' }).reason).toBe('signature does not match');
    expect(verifyAskRequest(ask(), { prompt: 'Write the migration.', now: Date.now() + 8 * 24 * 3600e3 }).reason).toBe('request too old');
    expect(verifyAskRequest(null, { prompt: 'x' }).ok).toBe(false);
  });
});

describe('relay passes', () => {
  const relay = 'https://relay.censai.app';

  test('a pass names its install and works only at its relay until it expires', () => {
    const pass = createRelayPass(alex, { relay });
    expect(pass.startsWith('crp1.')).toBe(true);
    expect(verifyRelayPass(pass, { relay })).toEqual({ ok: true, installId: alex.installId, reason: null });
    expect(verifyRelayPass(pass, { relay: 'https://other.relay' }).reason).toBe('pass is for another relay');
    expect(verifyRelayPass(pass, { relay, now: Date.now() + 10 * 60e3 }).reason).toBe('pass expired');
  });

  test('a pass cannot be borrowed or edited', () => {
    const [prefix, payload, sig] = createRelayPass(alex, { relay }).split('.');
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    const swapped = Buffer.from(JSON.stringify({ ...claims, iid: sam.installId })).toString('base64url');
    expect(verifyRelayPass(`${prefix}.${swapped}.${sig}`, { relay }).reason).toBe('install id does not match its key');
    const longer = Buffer.from(JSON.stringify({ ...claims, exp: claims.exp + 60 })).toString('base64url');
    expect(verifyRelayPass(`${prefix}.${longer}.${sig}`, { relay }).reason).toBe('signature does not match');
    expect(verifyRelayPass('nope', { relay }).ok).toBe(false);
  });
});

describe('agent addresses', () => {
  test('direct and relay forms share the same path after the host', () => {
    const direct = parseAgentAddress(`http://localhost:3003/api/mcp/agents/${ENDPOINT}`);
    expect(direct).toMatchObject({ installId: null, endpointId: ENDPOINT, viaRelay: false });
    expect(direct.askUrl).toBe(`http://localhost:3003/api/mcp/agents/${ENDPOINT}/ask`);
    const relayed = relayAgentAddress({ relayUrl: 'https://relay.censai.app/', installId: alex.installId, endpointId: ENDPOINT });
    expect(relayed).toBe(`https://relay.censai.app/i/${alex.installId}/api/mcp/agents/${ENDPOINT}`);
    expect(parseAgentAddress(`${relayed}/ask`)).toMatchObject({ installId: alex.installId, viaRelay: true, mcpUrl: relayed });
  });

  test('anything else is refused in plain words', () => {
    expect(() => parseAgentAddress('not a url')).toThrow(/not a web address/);
    expect(() => parseAgentAddress('ftp://x/api/mcp/agents/1')).toThrow(/https/);
    expect(() => parseAgentAddress('https://x.com/somewhere')).toThrow(/censaiOS agent/);
    expect(() => parseAgentAddress(`https://user:pw@x.com/api/mcp/agents/${ENDPOINT}`)).toThrow();
  });
});
