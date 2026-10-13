import { jest } from '@jest/globals';
import { loadSessionWithRetry } from '../src/app/hooks/loadSessionWithRetry.js';
import { getSession } from '../src/lib/api/system.js';

describe('session bootstrap recovery', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('waits through a short API restart and returns the recovered session', async () => {
    const recovered = { authenticated: true, oauthConfigured: false };
    const loadSession = jest.fn()
      .mockRejectedValueOnce(new Error('API restarting'))
      .mockRejectedValueOnce(new Error('API still starting'))
      .mockResolvedValue(recovered);
    const waitFor = jest.fn().mockResolvedValue(undefined);

    await expect(loadSessionWithRetry(loadSession, {
      delays: [0, 200, 350],
      waitFor,
    })).resolves.toEqual(recovered);

    expect(loadSession).toHaveBeenCalledTimes(3);
    expect(waitFor.mock.calls).toEqual([[200], [350]]);
  });

  test('returns a real unauthenticated response without retrying it', async () => {
    const unauthenticated = { authenticated: false, oauthConfigured: true };
    const loadSession = jest.fn().mockResolvedValue(unauthenticated);
    const waitFor = jest.fn();

    await expect(loadSessionWithRetry(loadSession, {
      delays: [0, 200],
      waitFor,
    })).resolves.toEqual(unauthenticated);

    expect(loadSession).toHaveBeenCalledTimes(1);
    expect(waitFor).not.toHaveBeenCalled();
  });

  test('reports a persistent outage after the bounded retries', async () => {
    const outage = new Error('API unavailable');
    const loadSession = jest.fn().mockRejectedValue(outage);

    await expect(loadSessionWithRetry(loadSession, {
      delays: [0, 200],
      waitFor: jest.fn().mockResolvedValue(undefined),
    })).rejects.toBe(outage);
  });

  test('treats a proxy error as unavailable instead of logged out', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
    });

    await expect(getSession()).rejects.toThrow('Session check failed (HTTP 500)');
  });
});
