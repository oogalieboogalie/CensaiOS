// Only real tool names from the toolchain list pass. Before this fix a
// built-in object name such as "constructor" passed the check, so Install ran
// `bash -lc undefined` in the sandbox and Save stored a tool that does not exist.
import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

const exec = jest.fn(async () => ({ code: 0, stdout: 'made-up-sandbox\n', stderr: '' }));
const writeToolchainConfig = jest.fn();

jest.unstable_mockModule('../server/runner/client.js', () => ({ runnerClient: { exec } }));
jest.unstable_mockModule('../server/security/systemAdmin.js', () => ({
  requireSystemAdmin: (_req, _res, next) => next(),
}));
jest.unstable_mockModule('../server/sandbox/toolchainConfig.js', () => ({
  readToolchainConfig: () => ({ enabled: [], apiKeys: {} }),
  writeToolchainConfig,
}));
jest.unstable_mockModule('../server/sandbox/rebuild.js', () => ({
  getRebuildState: () => ({ status: 'idle' }),
  resetRebuildState: jest.fn(),
  removeSandboxImage: jest.fn(),
  triggerRebuild: jest.fn(),
}));

const { sandboxRouter } = await import('../server/routes/sandbox.js');
const { TOOLCHAIN_IDS } = await import('../server/sandbox/toolchains.js');

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/sandbox', sandboxRouter);
  return a;
}

beforeEach(() => { exec.mockClear(); writeToolchainConfig.mockClear(); });

test.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])('install refuses %s and runs nothing', async (id) => {
  const res = await request(app()).post('/api/sandbox/toolchains/install').send({ id });
  expect(res.status).toBe(400);
  expect(exec).not.toHaveBeenCalled();
});

test('save keeps only real tool names', async () => {
  const real = TOOLCHAIN_IDS[0];
  await request(app()).post('/api/sandbox/toolchains').send({ enabled: ['constructor', real, 'toString'] });
  expect(writeToolchainConfig).toHaveBeenCalled();
  expect(writeToolchainConfig.mock.calls[0][0].enabled).toEqual([real]);
});
