import { jest } from '@jest/globals';
import { RUNTIME_MODES } from '../server/middleware/runtimeMode.js';

const completeRun = jest.fn();
const failRun = jest.fn();
const recordRunAction = jest.fn();
const publishAgentCardEvent = jest.fn();

jest.unstable_mockModule('../server/runs/lifecycle.js', () => ({ completeRun, failRun, recordRunAction }));
jest.unstable_mockModule('../server/agent-card-runs/events.js', () => ({ publishAgentCardEvent }));

const {
  executeN8NChatAgentCardRun,
  extractN8NText,
  n8nSessionId,
} = await import('../server/agent-card-runs/executors/n8n.js');

const run = {
  id: 'run-n8n-1',
  metadata: {
    prompt: 'Research this topic', cardId: 'ext:n8n:1', workspaceId: 'ws-1', callerId: '7',
  },
};
const executor = {
  protocolVersion: 'n8n-chat-v1', endpoint: 'http://127.0.0.1:5678/webhook/chat',
};
const local = { mode: RUNTIME_MODES.LOCAL_DESKTOP };

describe('n8n Chat Trigger durable executor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    completeRun.mockResolvedValue();
    failRun.mockResolvedValue();
    recordRunAction.mockResolvedValue();
  });

  test('sends the official fixed request and persists bounded text', async () => {
    const guardedFetch = jest.fn(async () => new Response(JSON.stringify({ output: 'Remote result' }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
    const outcome = await executeN8NChatAgentCardRun(run, executor, { ...local, guardedFetch });
    expect(outcome).toEqual({ status: 'succeeded', result: 'Remote result' });
    const [, init] = guardedFetch.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      action: 'sendMessage', chatInput: 'Research this topic',
      sessionId: n8nSessionId(run.metadata),
    });
    expect(init.redirect).toBeUndefined();
    expect(completeRun).toHaveBeenCalledWith(expect.objectContaining({
      runId: run.id, metadata: expect.objectContaining({ result: 'Remote result' }),
    }));
    expect(recordRunAction).toHaveBeenNthCalledWith(1, expect.objectContaining({
      name: 'agent_card.external_dispatch', metadata: {
        adapter: 'n8n_chat', protocolVersion: 'n8n-chat-v1',
      },
    }));
    expect(JSON.stringify(recordRunAction.mock.calls)).not.toContain('ws-1');
    expect(failRun).not.toHaveBeenCalled();
  });

  test('derives stable opaque sessions with caller isolation', () => {
    const session = n8nSessionId(run.metadata);
    expect(session).toMatch(/^censai-[a-f0-9]{32}$/);
    expect(session).toBe(n8nSessionId({ ...run.metadata }));
    expect(session).not.toBe(n8nSessionId({ ...run.metadata, callerId: '8' }));
    expect(session).not.toContain('ws-1');
    expect(session).not.toContain('ext:n8n');
  });

  test('accepts only unambiguous official text response shapes', () => {
    expect(extractN8NText({ output: 'one' })).toBe('one');
    expect(extractN8NText({ text: 'two' })).toBe('two');
    expect(extractN8NText({ message: 'three' })).toBe('three');
    expect(extractN8NText({ message: { text: 'four' } })).toBe('four');
    expect(extractN8NText({ output: 'same', text: 'same' })).toBe('same');
    expect(() => extractN8NText({ output: 'one', text: 'two' })).toThrow('ambiguous');
    expect(() => extractN8NText({ executionStarted: true })).toThrow('did not contain text');
    expect(() => extractN8NText([{ output: 'array' }])).toThrow('did not contain text');
    expect(() => extractN8NText({ output: 'x'.repeat(60_001) })).toThrow('output limit');
  });

  test('revalidates 307 redirects and preserves the fixed body', async () => {
    const guardedFetch = jest.fn()
      .mockResolvedValueOnce(new Response('', {
        status: 307, headers: { location: '/webhook/next' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: 'redirected' }), {
        status: 200, headers: { 'content-type': 'application/json' },
      }));
    const outcome = await executeN8NChatAgentCardRun(run, executor, { ...local, guardedFetch });
    expect(outcome).toEqual({ status: 'succeeded', result: 'redirected' });
    expect(guardedFetch).toHaveBeenCalledTimes(2);
    expect(guardedFetch.mock.calls[1][0].toString()).toBe('http://127.0.0.1:5678/webhook/next');
    expect(guardedFetch.mock.calls[1][1].body).toBe(guardedFetch.mock.calls[0][1].body);
  });

  test('fails non-JSON, oversized, unsafe redirect, and HTTP errors durably', async () => {
    const responses = [
      new Response('<html />', { status: 200, headers: { 'content-type': 'text/html' } }),
      new Response('{}', { status: 200, headers: {
        'content-type': 'application/json', 'content-length': '256001',
      } }),
      new Response('', { status: 302, headers: { location: '/login' } }),
      new Response('', { status: 500 }),
    ];
    for (const response of responses) {
      jest.clearAllMocks();
      failRun.mockResolvedValue();
      recordRunAction.mockResolvedValue();
      const outcome = await executeN8NChatAgentCardRun(run, executor, {
        ...local, guardedFetch: async () => response,
      });
      expect(outcome.status).toBe('failed');
      expect(failRun).toHaveBeenCalledWith({ runId: run.id, error: expect.any(Error) });
      expect(completeRun).not.toHaveBeenCalled();
    }
  });

  test('applies a hard request timeout', async () => {
    const guardedFetch = jest.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
    }));
    const outcome = await executeN8NChatAgentCardRun(run, executor, {
      ...local, guardedFetch, timeoutMs: 1,
    });
    expect(outcome.status).toBe('failed');
    expect(failRun).toHaveBeenCalledWith({
      runId: run.id, error: expect.objectContaining({ name: 'TimeoutError' }),
    });
    expect(completeRun).not.toHaveBeenCalled();
  });
});
