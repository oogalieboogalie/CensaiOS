import { jest } from '@jest/globals';
import request from 'supertest';
import {
  isRunnerRequestAuthorized,
  runnerSecretStatus,
} from '../server/runner/auth.js';
import { RunnerClient } from '../server/runner/client.js';
import { createRunnerApp } from '../server/runner/service.js';

const SECRET = 'runner-test-secret-that-is-at-least-32-characters';

describe('remote runner authentication', () => {
  test('missing or weak secrets fail closed', () => {
    expect(runnerSecretStatus('').code).toBe('RUNNER_SECRET_MISSING');
    expect(runnerSecretStatus('short').code).toBe('RUNNER_SECRET_WEAK');
    expect(() => createRunnerApp({ runnerSecret: '' })).toThrow(/required/i);
    expect(isRunnerRequestAuthorized('short', 'short')).toBe(false);
  });

  test('service requires the exact strong credential', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const app = createRunnerApp({ runnerSecret: SECRET });
    await request(app).get('/health').expect(401);
    await request(app).get('/health').set('x-runner-secret', `${SECRET}x`).expect(401);
    await request(app).get('/health').set('x-runner-secret', SECRET).expect(200);
    warn.mockRestore();
  });

  test('client refuses weak configuration without making a network request', async () => {
    const client = new RunnerClient();
    jest.spyOn(client, 'getSecret').mockReturnValue('short');
    jest.spyOn(client, 'isEnabled').mockReturnValue(true);
    jest.spyOn(client, 'isRemote').mockReturnValue(true);
    const fetchBefore = globalThis.fetch;
    globalThis.fetch = jest.fn();
    try {
      await expect(client.execRemote('node', ['--version'])).rejects.toMatchObject({
        code: 'RUNNER_SECRET_WEAK',
      });
      await expect(client.getHealth()).resolves.toMatchObject({
        ok: false, configurationError: 'RUNNER_SECRET_WEAK',
      });
      expect(globalThis.fetch).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = fetchBefore;
    }
  });

  test('client forwards the valid credential without exposing it in results', async () => {
    const client = new RunnerClient();
    jest.spyOn(client, 'getSecret').mockReturnValue(SECRET);
    const fetchBefore = globalThis.fetch;
    globalThis.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ code: 0 }) }));
    try {
      await expect(client.execRemote('node', ['--version'])).resolves.toEqual({ code: 0 });
      expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringMatching(/\/exec$/), expect.objectContaining({
        headers: expect.objectContaining({ 'x-runner-secret': SECRET }),
      }));
    } finally {
      globalThis.fetch = fetchBefore;
    }
  });
});
