import { jest } from '@jest/globals';

// CENSAI_ENV_KEYS=off keeps the computer's setup-file keys (.env and the
// Toolchains box) away from coding CLIs too, not only from chats. The CLI
// then uses the person's own saved key or its own sign-in.

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.unstable_mockModule('../server/logger.js', () => ({ createLogger: jest.fn(() => logger) }));

const { resolveCliKey } = await import('../server/cli-agents/index.js');
const { envKeysSwitchedOff } = await import('../server/security/envKeys.js');

// A CLI with its own sign-in folder skips the shared-login claim, so the test
// never touches the real login-owners file.
const adapter = { id: 'claudecode', keyEnv: 'ANTHROPIC_API_KEY', vaultProvider: 'anthropic', personalHome: true };
const MADE_UP = 'sk-ant-made-up-setup-file-0000000000';
const owner = async () => true;
const noVault = async () => null;
const noToolchain = () => ({ apiKeys: {} });

beforeEach(() => logger.info.mockClear());

test('switched off: the owner\'s Claude Code gets no key from the setup file', async () => {
  const env = { ANTHROPIC_API_KEY: MADE_UP, CENSAI_ENV_KEYS: 'off' };
  const found = await resolveCliKey({ adapter, userId: '7' }, { mayUse: owner, vault: noVault, toolchain: noToolchain, env });
  expect(found).toBeNull();
  expect(logger.info).toHaveBeenCalledWith('setup-file key kept from cli (switched off)', { cli: 'claudecode', keyName: 'ANTHROPIC_API_KEY' });
  expect(JSON.stringify(logger.info.mock.calls)).not.toContain(MADE_UP);
});

test('switched off: the Toolchains key is kept back too', async () => {
  const toolchain = () => ({ apiKeys: { ANTHROPIC_API_KEY: MADE_UP } });
  const found = await resolveCliKey({ adapter, userId: '7' }, { mayUse: owner, vault: noVault, toolchain, env: { CENSAI_ENV_KEYS: 'no' } });
  expect(found).toBeNull();
});

test('switched off: the person\'s own saved key still works', async () => {
  const vault = async () => ({ apiKey: 'sk-ant-their-own-0000000000' });
  const env = { ANTHROPIC_API_KEY: MADE_UP, CENSAI_ENV_KEYS: 'off' };
  const found = await resolveCliKey({ adapter, userId: '7' }, { mayUse: owner, vault, toolchain: noToolchain, env });
  expect(found).toEqual({ key: 'sk-ant-their-own-0000000000', source: 'vault' });
});

test('switched on: the owner still gets the setup-file key, a teammate does not', async () => {
  const env = { ANTHROPIC_API_KEY: MADE_UP };
  expect(await resolveCliKey({ adapter, userId: '7' }, { mayUse: owner, vault: noVault, toolchain: noToolchain, env }))
    .toEqual({ key: MADE_UP, source: 'env' });
  expect(await resolveCliKey({ adapter, userId: '8' }, { mayUse: async () => false, vault: noVault, toolchain: noToolchain, env }))
    .toBeNull();
  expect(logger.info).not.toHaveBeenCalledWith('setup-file key kept from cli (switched off)', expect.anything());
});

test('the switch reads off, false, 0 and no, in any case', () => {
  for (const value of ['off', 'OFF', 'false', '0', ' no ']) expect(envKeysSwitchedOff({ CENSAI_ENV_KEYS: value })).toBe(true);
  for (const value of [undefined, '', 'on', 'yes']) expect(envKeysSwitchedOff({ CENSAI_ENV_KEYS: value })).toBe(false);
});
