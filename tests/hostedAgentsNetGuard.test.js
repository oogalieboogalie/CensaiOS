import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// Hosted agents never reach a private address (this computer, the office
// network, the cloud's settings service) on a hosted or shared censaiOS. On
// the desktop app the owner may still use a LangGraph dev server on localhost.

const { onLogRecord } = await import('../server/logger.js');
const { assertVendorAddress } = await import('../server/hostedAgents/netGuard.js');
const { getVendor } = await import('../server/hostedAgents/vendors/index.js');
const { createHostedAgentsRouter } = await import('../server/routes/hostedAgents.js');

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const MODE_KEYS = ['CENSAI_MODE', 'HOMEBASE_MODE', 'HOMEBASE_ALLOW_LOCAL_FILES', 'HOSTED_ELEVENLABS_BASE_URL'];
const saved = Object.fromEntries(MODE_KEYS.map((k) => [k, process.env[k]]));
const runAs = (mode, extra = {}) => { for (const k of MODE_KEYS) delete process.env[k]; Object.assign(process.env, { CENSAI_MODE: mode, ...extra }); };
afterEach(() => { for (const k of MODE_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

const logged = [];
onLogRecord((record) => { if (record.namespace === 'hosted-agents') logged.push(record); });

const lc = getVendor('langchain');
const eleven = getVendor('elevenlabs');
const lcAnswers = () => jest.fn(async (url) => (new URL(url).pathname === '/threads'
  ? json({ thread_id: 'thr-1' })
  : json({ messages: [{ type: 'ai', content: 'Hi from the dev server.' }] })));

describe('the address check', () => {
  test('refuses private, loopback, link-local and metadata addresses where they are not allowed', async () => {
    for (const url of ['http://127.0.0.1:2024', 'https://169.254.169.254/latest', 'http://[::1]:2024', 'http://[::ffff:127.0.0.1]:2024',
      'https://10.0.0.8', 'https://192.168.1.20', 'http://0x7f.1', 'https://[fd00:ec2::254]']) {
      await expect(assertVendorAddress(url, { local: false })).rejects.toMatchObject({ code: 'HOSTED_AGENT_PRIVATE_ADDRESS', statusCode: 400 });
    }
    await expect(assertVendorAddress('https://sneaky.example', { local: false, resolve: async () => [{ address: '93.184.216.34' }, { address: '10.0.0.5' }] }))
      .rejects.toThrow(/private network.*public internet/s);
  });

  test('public addresses pass, unknown names are said plainly, junk is refused', async () => {
    await expect(assertVendorAddress('https://shop.us.langgraph.app', { local: false, resolve: async () => [{ address: '34.120.1.2' }] })).resolves.toBeInstanceOf(URL);
    await expect(assertVendorAddress('https://nowhere.invalid', { local: false, resolve: async () => [] })).rejects.toMatchObject({ code: 'HOSTED_AGENT_UNREACHABLE' });
    await expect(assertVendorAddress('file:///etc/passwd', { local: true })).rejects.toMatchObject({ code: 'HOSTED_AGENT_BAD_ADDRESS' });
  });

  test('every refusal is logged under hosted-agents', async () => {
    logged.length = 0;
    await expect(assertVendorAddress('http://127.0.0.1:2024', { label: 'LangChain', local: false })).rejects.toThrow();
    expect(logged).toEqual([expect.objectContaining({
      level: 'warn', message: 'address refused: private network', meta: { vendor: 'LangChain', host: '127.0.0.1', address: '127.0.0.1' },
    })]);
  });
});

describe('on a hosted or shared censaiOS', () => {
  test('a LangChain address on this computer is refused at import, and nothing is saved or called', async () => {
    runAs('cloud_saas');
    const fetchImpl = jest.fn();
    const writes = [];
    const a = express();
    a.use((req, _res, next) => { req.session = { userId: 7 }; next(); });
    a.use('/hosted', createHostedAgentsRouter({
      db: { query: jest.fn(async (sql) => { writes.push(sql); return { rows: [] }; }) },
      fetchImpl,
      getUserApiKeyConfig: async () => ({ apiKey: 'lsv2_fake' }),
      upsertAgent: jest.fn(),
      ownerGate: (_req, _res, next) => next(),
    }));
    const res = await request(a).post('/hosted/import').send({ vendor: 'langchain', ref: 'agent', endpoint: 'http://127.0.0.1:2024' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('HOSTED_AGENT_PRIVATE_ADDRESS');
    expect(res.body.error).toMatch(/inside a private network/);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  test('a saved address is checked again on every message', async () => {
    runAs('cloud_saas');
    const fetchImpl = jest.fn();
    await expect(lc.send({ ref: 'agent', endpoint: 'https://169.254.169.254', apiKey: 'k', thread: 'thr-1', text: 'hi', fetchImpl }))
      .rejects.toMatchObject({ code: 'HOSTED_AGENT_PRIVATE_ADDRESS' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('public deployments still work, without following redirects', async () => {
    runAs('cloud_saas');
    const fetchImpl = lcAnswers();
    const reply = await lc.send({ ref: 'agent', endpoint: 'https://34.120.1.2', apiKey: 'k', thread: null, text: 'hi', fetchImpl });
    expect(reply.text).toBe('Hi from the dev server.');
    expect(fetchImpl.mock.calls[0][1].redirect).toBe('manual');
    // The connection goes to the address that was checked (tests/publicAddress.test.js).
    expect(fetchImpl.mock.calls[0][1].pinnedAddresses).toEqual(['34.120.1.2']);
  });

  test('an address override pointing inside the network is refused', async () => {
    runAs('cloud_saas', { HOSTED_ELEVENLABS_BASE_URL: 'http://10.0.0.9' });
    const fetchImpl = jest.fn();
    await expect(eleven.describe({ ref: 'agent_abc123', apiKey: 'xi', fetchImpl })).rejects.toMatchObject({ code: 'HOSTED_AGENT_PRIVATE_ADDRESS' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('an ElevenLabs chat link that points inside the network is never opened', async () => {
    runAs('cloud_saas', { HOSTED_ELEVENLABS_BASE_URL: 'https://34.120.9.9' });
    const fetchImpl = jest.fn(async () => json({ signed_url: 'wss://127.0.0.1:9000/v1/convai/conversation?token=secret' }));
    const WebSocketImpl = jest.fn();
    await expect(eleven.send({ ref: 'agent_abc123', apiKey: 'xi', text: 'hi', history: [], fetchImpl, WebSocketImpl }))
      .rejects.toMatchObject({ code: 'HOSTED_AGENT_PRIVATE_ADDRESS' });
    expect(WebSocketImpl).not.toHaveBeenCalled();
    expect(JSON.stringify(logged)).not.toContain('secret');
  });

  test('a private server refuses too unless it turned on local files', async () => {
    runAs('private_server');
    await expect(lc.send({ ref: 'agent', endpoint: 'http://127.0.0.1:2024', apiKey: 'k', thread: null, text: 'hi', fetchImpl: jest.fn() }))
      .rejects.toMatchObject({ code: 'HOSTED_AGENT_PRIVATE_ADDRESS' });
    runAs('private_server', { HOMEBASE_ALLOW_LOCAL_FILES: 'true' });
    await expect(lc.send({ ref: 'agent', endpoint: 'http://127.0.0.1:2024', apiKey: 'k', thread: null, text: 'hi', fetchImpl: lcAnswers() }))
      .resolves.toMatchObject({ text: 'Hi from the dev server.' });
  });
});

test('on the desktop app the owner may use a LangGraph dev server on this computer', async () => {
  runAs('local_desktop');
  const target = lc.normalize({ ref: 'agent', endpoint: 'http://127.0.0.1:2024' });
  const fetchImpl = lcAnswers();
  const reply = await lc.send({ ...target, apiKey: 'k', thread: null, text: 'hi', fetchImpl });
  expect(reply).toEqual({ text: 'Hi from the dev server.', thread: 'thr-1' });
  expect(fetchImpl.mock.calls[0][0]).toBe('http://127.0.0.1:2024/threads');
  expect(fetchImpl.mock.calls[0][1].redirect).toBeUndefined();
  expect(fetchImpl.mock.calls[0][1].pinnedAddresses).toBeUndefined();
});
