// Agent endpoints, the pure parts: MCP protocol handling, the board log in
// the shared canvas doc, the outside tool allowlist, limits and snippets.
import { jest } from '@jest/globals';
import * as Y from 'yjs';

jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn(), on: jest.fn() } }));

const { handleMcpMessage, toolNameFor, SUPPORTED_PROTOCOL_VERSIONS } = await import('../server/agentEndpoints/mcpProtocol.js');
const { appendOutsideExchangeInDoc, outsideExchange, findAgentChat } = await import('../server/agentEndpoints/boardLog.js');
const { readDocWindows } = await import('../server/agent-registry/helpCards.js');
const { upsertWindowInDoc } = await import('../server/collab/serverWriter.js');
const { outsideTools, OUTSIDE_CALLER_TOOLS } = await import('../server/agentEndpoints/runAgent.js');
const { createLimiter } = await import('../server/agentEndpoints/rateLimit.js');
const { createEndpointToken, isEndpointTokenShape, hashEndpointToken } = await import('../server/agentEndpoints/tokens.js');
const { setupSnippets, serverName, tunnelSteps, KEY_PLACEHOLDER } = await import('../src/lib/agentEndpoints/snippets.js');

const endpoint = { id: 'e1', agent_id: 'atlas', agent_name: 'Atlas', card_id: 'agent:atlas', window_id: 'chat-2', workspace_id: 'ws' };
const ask = jest.fn(async (message) => ({ answer: `got ${message}` }));

describe('MCP protocol', () => {
  test('initialize agrees on a version the client asked for, else offers the newest', async () => {
    const asked = await handleMcpMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } }, { endpoint, ask });
    expect(asked.body.result.protocolVersion).toBe('2025-03-26');
    const unknown = await handleMcpMessage({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } }, { endpoint, ask });
    expect(unknown.body.result.protocolVersion).toBe(SUPPORTED_PROTOCOL_VERSIONS[0]);
    expect(unknown.body.result.serverInfo.name).toBe('censaiOS');
  });

  test('batches, bad envelopes, unknown methods and unknown tools are JSON-RPC errors', async () => {
    expect((await handleMcpMessage([], { endpoint, ask })).status).toBe(400);
    expect((await handleMcpMessage({ id: 1, method: 'ping' }, { endpoint, ask })).body.error.code).toBe(-32600);
    expect((await handleMcpMessage({ jsonrpc: '2.0', id: 1, method: 'resources/list' }, { endpoint, ask })).body.error.code).toBe(-32601);
    expect((await handleMcpMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'ask_sage' } }, { endpoint, ask })).body.error.code).toBe(-32602);
    expect((await handleMcpMessage({ jsonrpc: '2.0', id: 7, method: 'ping' }, { endpoint, ask })).body).toEqual({ jsonrpc: '2.0', id: 7, result: {} });
  });

  test('tool names are safe identifiers made from the agent name', () => {
    expect(toolNameFor('Atlas')).toBe('ask_atlas');
    expect(toolNameFor('The Architect!')).toBe('ask_the_architect');
    expect(toolNameFor('')).toBe('ask_agent');
  });
});

describe('board log', () => {
  function boardWith(wins) {
    const doc = new Y.Doc();
    for (const win of wins) upsertWindowInDoc(doc, { x: 0, y: 0, w: 300, h: 300, ...win });
    return doc;
  }

  test('the exchange lands in the chat it was shared from, after what is already there', () => {
    const doc = boardWith([
      { id: 'chat-1', kind: 'chat', agentId: 'atlas', msgs: [] },
      { id: 'chat-2', kind: 'chat', agentId: 'atlas', msgs: [{ from: 'me', text: 'earlier' }] },
    ]);
    const exchange = outsideExchange({ agentId: 'atlas', keyLabel: 'Cursor', via: 'mcp', question: 'Q?', answer: 'A.', at: 't' });
    expect(appendOutsideExchangeInDoc(doc, endpoint, exchange)).toBe('chat-2');
    const msgs = readDocWindows(doc).find((w) => w.id === 'chat-2').msgs;
    expect(msgs.map((m) => m.text)).toEqual(['earlier', 'Q?', 'A.']);
    expect(msgs[1]).toMatchObject({ from: 'outside', outsideCall: { keyLabel: 'Cursor', via: 'mcp' } });
    expect(msgs[2]).toMatchObject({ from: 'atlas', outsideReply: { keyLabel: 'Cursor' } });
  });

  test('falls back to any chat with that agent, and skips boards without one', () => {
    const wins = [{ id: 'other', kind: 'chat', agentId: 'ATLAS' }, { id: 'n', kind: 'chat', agentId: 'nexus' }];
    expect(findAgentChat(wins, { windowId: 'gone', agentId: 'atlas' }).id).toBe('other');
    const empty = boardWith([{ id: 'n', kind: 'chat', agentId: 'nexus' }]);
    expect(appendOutsideExchangeInDoc(empty, endpoint, outsideExchange({ agentId: 'atlas', question: 'q', answer: 'a' }))).toBeNull();
  });

  test('a failed call is shown as an error reply', () => {
    const [, reply] = outsideExchange({ agentId: 'atlas', question: 'q', error: 'no key' });
    expect(reply).toMatchObject({ error: true, text: 'I could not answer that: no key' });
  });
});

test('outside callers only get look-up tools', () => {
  const tool = (name) => ({ type: 'function', function: { name } });
  const kept = outsideTools([tool('recall'), tool('project_write'), tool('run_command'), tool('message_to'), tool('web_search'), tool('journal')]);
  expect(kept.map((t) => t.function.name)).toEqual(['recall', 'web_search']);
  for (const risky of ['project_write', 'project_edit', 'run_command', 'message_to', 'journal', 'read_journal', 'request_agent_help']) {
    expect(OUTSIDE_CALLER_TOOLS).not.toContain(risky);
  }
});

test('limiter: calls per minute, calls at once, and the minute resets', () => {
  let now = 0;
  const limiter = createLimiter({ limits: { callsPerMinute: 3, concurrentPerKey: 1, badKeysPerMinute: 2 }, now: () => now });
  const first = limiter.acquire('k');
  expect(first.ok).toBe(true);
  expect(limiter.acquire('k')).toMatchObject({ ok: false, reason: 'busy' });
  first.release();
  first.release();
  limiter.acquire('k').release();
  limiter.acquire('k').release();
  expect(limiter.acquire('k')).toMatchObject({ ok: false, reason: 'rate' });
  now += 60_000;
  expect(limiter.acquire('k').ok).toBe(true);
  expect(limiter.badKey('1.2.3.4').ok).toBe(true);
  expect(limiter.badKey('1.2.3.4').ok).toBe(true);
  expect(limiter.badKey('1.2.3.4').ok).toBe(false);
});

test('keys are long random capability tokens stored only as hashes', () => {
  const a = createEndpointToken();
  const b = createEndpointToken();
  expect(isEndpointTokenShape(a)).toBe(true);
  expect(a).not.toBe(b);
  expect(hashEndpointToken(a)).toMatch(/^[0-9a-f]{64}$/);
  expect(isEndpointTokenShape('cak_short')).toBe(false);
});

test('setup snippets point at the agent address and carry the key only when given', () => {
  const ep = { agentName: 'Atlas', mcpPath: '/api/mcp/agents/e1', askPath: '/api/mcp/agents/e1/ask' };
  const withKey = setupSnippets({ base: 'http://localhost:3002/', endpoint: ep, key: 'cak_x' });
  const code = withKey.find((s) => s.id === 'claude-code').text;
  expect(code).toBe('claude mcp add --transport http censai-atlas http://localhost:3002/api/mcp/agents/e1 --header "Authorization: Bearer cak_x"');
  const cursor = JSON.parse(withKey.find((s) => s.id === 'cursor').text);
  expect(cursor.mcpServers['censai-atlas']).toEqual({ url: 'http://localhost:3002/api/mcp/agents/e1', headers: { Authorization: 'Bearer cak_x' } });
  const desktop = JSON.parse(withKey.find((s) => s.id === 'claude-desktop').text);
  expect(desktop.mcpServers['censai-atlas'].env.AUTH_HEADER).toBe('Bearer cak_x');
  const later = setupSnippets({ base: 'https://x.trycloudflare.com', endpoint: ep });
  expect(later.every((s) => !s.text.includes('cak_'))).toBe(true);
  expect(later.find((s) => s.id === 'http').text).toContain(KEY_PLACEHOLDER);
  expect(serverName('The Architect')).toBe('censai-the-architect');
});

describe('outside-only port (what a tunnel reaches)', () => {
  test('serves agent endpoints and nothing else, and refuses browser pages', async () => {
    const express = (await import('express')).default;
    const request = (await import('supertest')).default;
    const { createOutsideApp } = await import('../server/agentEndpoints/outsideListener.js');
    const stub = express.Router();
    stub.post('/agents/:id', (req, res) => res.json({ reached: req.params.id, body: req.body }));
    const app = createOutsideApp(stub);
    expect((await request(app).post('/api/mcp/agents/e1').send({ a: 1 })).body).toEqual({ reached: 'e1', body: { a: 1 } });
    for (const path of ['/', '/api/auth/local', '/api/workspaces', '/api/chat', '/index.html']) {
      expect((await request(app).get(path)).status).toBe(404);
      expect((await request(app).post(path).send({})).status).toBe(404);
    }
    expect((await request(app).post('/api/mcp/agents/e1').set('Origin', 'https://evil.example').send({})).status).toBe(403);
  });

  test('port and host defaults, Docker, and off', async () => {
    const { outsideListenerConfig } = await import('../server/agentEndpoints/outsideListener.js');
    expect(outsideListenerConfig({})).toEqual({ port: 3003, host: '127.0.0.1' });
    expect(outsideListenerConfig({ CENSAI_IN_CONTAINER: '1' })).toEqual({ port: 3003, host: '0.0.0.0' });
    expect(outsideListenerConfig({ CENSAI_AGENT_ENDPOINT_PORT: '4100' }).port).toBe(4100);
    expect(outsideListenerConfig({ CENSAI_AGENT_ENDPOINT_PORT: 'off' })).toBeNull();
    expect(outsideListenerConfig({ CENSAI_AGENT_ENDPOINT_PORT: 'banana' })).toBeNull();
  });
});

test('the tunnel guide never points at the main censaiOS port', () => {
  expect(tunnelSteps(3003).find((s) => s.id === 'run').text).toBe('cloudflared tunnel --url http://localhost:3003');
  expect(tunnelSteps(null).find((s) => s.id === 'run').text).not.toMatch(/3001|3002|5173/);
});
