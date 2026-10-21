import { jest } from '@jest/globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// An outside tool started as a program gets the server's shared settings
// (CENSAI_CLI_AGENT_ENV_PASS) only when the person who added it may use this
// computer's own keys, the same owner check as coding CLIs. Everyone else's
// tool gets only the one key they saved for it. Pat Example (7) is the
// owner, Sam Example (8) is not.

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.unstable_mockModule('../server/logger.js', () => ({ createLogger: jest.fn(() => logger) }));
jest.unstable_mockModule('../server/cli-agents/serverKeyScope.js', () => ({
  cliMayUseServerKeys: jest.fn(async (userId) => String(userId) === '7'),
}));

const { callServerTool, closeAll, stdioServerKeys } = await import('../server/outsideTools/connections.js');
const { stdioEnv } = await import('../server/outsideTools/stdioClient.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS_SERVER = path.join(here, 'fixtures/outside-tools/settings-server.mjs');
const row = (id, userId) => ({
  id, user_id: userId, transport: 'stdio', command: process.execPath, args: [SETTINGS_SERVER], secret_env: 'MY_TOOL_KEY', updated_at: 1,
});

let saved;
beforeEach(() => {
  logger.info.mockClear();
  saved = { pass: process.env.CENSAI_CLI_AGENT_ENV_PASS, value: process.env.MADE_UP_PASSED };
  process.env.CENSAI_CLI_AGENT_ENV_PASS = 'MADE_UP_PASSED';
  process.env.MADE_UP_PASSED = 'made-up-shared-value';
});
afterEach(() => {
  closeAll();
  for (const [name, value] of [['CENSAI_CLI_AGENT_ENV_PASS', saved.pass], ['MADE_UP_PASSED', saved.value]]) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});

test("Pat's (owner) tool sees the shared setting", async () => {
  expect(await callServerTool(row('srv-pat', 7), 'k-pat', 'settings', {})).toBe('sees: MADE_UP_PASSED, MY_TOOL_KEY');
  expect(logger.info).not.toHaveBeenCalled();
});

test("Sam's tool gets only Sam's own key, and one line says how many were held back", async () => {
  expect(await callServerTool(row('srv-sam', 8), 'k-sam', 'settings', {})).toBe('sees: MY_TOOL_KEY');
  expect(logger.info).toHaveBeenCalledWith('shared settings held back from outside tool', { tool: 'srv-sam', held: 1 });
  expect(JSON.stringify(logger.info.mock.calls)).not.toMatch(/made-up-shared-value|MADE_UP_PASSED|Sam/);
});

test('a tool with no owner on record is treated as not allowed', async () => {
  expect(await stdioServerKeys({ id: 'srv-x', transport: 'stdio' })).toBe(false);
});

test('stdioEnv passes shared settings only with serverKeys', () => {
  const source = { PATH: '/bin', CENSAI_CLI_AGENT_ENV_PASS: 'MADE_UP_PASSED', MADE_UP_PASSED: 'v' };
  expect(stdioEnv({ source, serverKeys: true }).MADE_UP_PASSED).toBe('v');
  expect(stdioEnv({ source }).MADE_UP_PASSED).toBeUndefined();
});
