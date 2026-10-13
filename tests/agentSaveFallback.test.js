import { jest } from '@jest/globals';
import { saveAgent, updateAgentConfig } from '../src/lib/api/agents.js';

function response(status, body) {
  return { status, ok: status >= 200 && status < 300, json: jest.fn().mockResolvedValue(body) };
}

describe('agent save 409 fallback', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  test('PUT 409 for a canonical agent retries via PATCH /config', async () => {
    fetch
      .mockResolvedValueOnce(response(409, {
        error: 'Canonical family agents are product-owned and cannot be modified at runtime.',
        code: 'CANONICAL_AGENT_IMMUTABLE',
      }))
      .mockResolvedValueOnce(response(200, { id: 'atlas', model_name: 'openrouter/free' }));

    const result = await saveAgent({ id: 'atlas', name: 'Atlas', model_name: 'openrouter/free' });

    expect(result).toEqual({ id: 'atlas', model_name: 'openrouter/free' });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][0]).toBe('/api/agents/atlas');
    expect(fetch.mock.calls[1]).toEqual([
      '/api/agents/atlas/config',
      expect.objectContaining({ method: 'PATCH' }),
    ]);
  });

  test('non-409 failures still throw without a PATCH retry', async () => {
    fetch.mockResolvedValueOnce(response(500, { error: 'db down' }));

    await expect(saveAgent({ id: 'atlas', name: 'Atlas' })).rejects.toThrow('db down');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('agents without an id POST without fallback', async () => {
    fetch.mockResolvedValueOnce(response(200, { id: 'brand-new' }));

    await expect(saveAgent({ name: 'Newbie' })).resolves.toEqual({ id: 'brand-new' });
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'POST' });
  });

  test('updateAgentConfig PATCHes the per-agent config endpoint', async () => {
    fetch.mockResolvedValueOnce(response(200, { id: 'atlas', model_name: 'google/gemini-3-flash' }));

    await expect(updateAgentConfig('atlas', { model_name: 'google/gemini-3-flash' }))
      .resolves.toEqual({ id: 'atlas', model_name: 'google/gemini-3-flash' });
    expect(fetch).toHaveBeenCalledWith(
      '/api/agents/atlas/config',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });
});
