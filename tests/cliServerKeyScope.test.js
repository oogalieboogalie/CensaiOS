import { resolveCliKey } from '../server/cli-agents/index.js';
import { buildAgentEnv } from '../server/cli-agents/env.js';
import { cliMayUseServerKeys } from '../server/cli-agents/serverKeyScope.js';

// The keys in this computer's .env (and the Toolchains box) are the owner's.
// A teammate's terminal or CLI agent gets them only when the owner may share
// them (serverKeys.js mayUseServerKeys); otherwise only the teammate's own key.

// A CLI with its own sign-in folder skips the shared-login claim, so the test
// never touches the real login-owners file.
const adapter = { id: 'claudecode', label: 'Claude Code', keyEnv: 'ANTHROPIC_API_KEY', vaultProvider: 'anthropic', personalHome: true };
const SERVER_KEY = 'sk-ant-server-owned-0000000000';
const noVault = async () => null;
const noToolchain = () => ({ apiKeys: {} });

describe('CLI agents keep the server .env keys for the owner', () => {
  let saved;
  beforeEach(() => { saved = process.env.ANTHROPIC_API_KEY; process.env.ANTHROPIC_API_KEY = SERVER_KEY; });
  afterEach(() => {
    if (saved === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = saved;
  });

  test('a role user account never gets the .env key', async () => {
    const found = await resolveCliKey({ adapter, userId: '9' }, { mayUse: async () => false, vault: noVault, toolchain: noToolchain });
    expect(found?.key).not.toBe(SERVER_KEY);
    expect(found).toBeNull();
  });

  test('a role user account never gets the Toolchains key either', async () => {
    const toolchain = () => ({ apiKeys: { ANTHROPIC_API_KEY: 'sk-ant-toolchain-0000000000' } });
    const found = await resolveCliKey({ adapter, userId: '9' }, { mayUse: async () => false, vault: noVault, toolchain });
    expect(found).toBeNull();
  });

  test('the owner, or an account the owner shares with, still gets it', async () => {
    const found = await resolveCliKey({ adapter, userId: '1' }, { mayUse: async () => true, vault: noVault, toolchain: noToolchain });
    expect(found).toEqual({ key: SERVER_KEY, source: 'env' });
  });

  test('a Claude subscription token in .env is never handed out, even to the owner', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-oat01-subscription-0000000000';
    const found = await resolveCliKey({ adapter, userId: '1' }, { mayUse: async () => true, vault: noVault, toolchain: noToolchain });
    expect(found).toBeNull();
  });

  test("a teammate's own vault key always wins", async () => {
    const vault = async () => ({ apiKey: 'sk-ant-their-own-0000000000' });
    const found = await resolveCliKey({ adapter, userId: '9' }, { mayUse: async () => false, vault, toolchain: noToolchain });
    expect(found).toEqual({ key: 'sk-ant-their-own-0000000000', source: 'vault' });
  });

  test('a failed role lookup counts as not allowed', async () => {
    expect(await cliMayUseServerKeys('9', { mayUse: async () => { throw new Error('db down'); } })).toBe(false);
    expect(await cliMayUseServerKeys('1', { mayUse: async () => true })).toBe(true);
  });
});

describe('operator pass-through never carries provider keys to a teammate', () => {
  const source = {
    PATH: '/bin',
    CENSAI_CLI_AGENT_ENV_PASS: 'ANTHROPIC_BASE_URL,ANTHROPIC_API_KEY,OPENAI_API_KEY,XAI_API_KEY,SOME_SERVICE_TOKEN',
    ANTHROPIC_BASE_URL: 'https://proxy.example',
    ANTHROPIC_API_KEY: SERVER_KEY,
    OPENAI_API_KEY: 'sk-openai-server-0000000000',
    XAI_API_KEY: 'xai-server-0000000000',
    SOME_SERVICE_TOKEN: 'tok-server-0000000000',
  };

  test('a teammate keeps the harmless settings but none of the keys', () => {
    const env = buildAgentEnv({ source, serverKeys: false });
    expect(env.ANTHROPIC_BASE_URL).toBe('https://proxy.example');
    for (const name of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'XAI_API_KEY', 'SOME_SERVICE_TOKEN']) expect(env[name]).toBeUndefined();
  });

  test("the teammate's own key still goes in under the CLI's key name", () => {
    const env = buildAgentEnv({ source, serverKeys: false, key: 'sk-ant-their-own-0000000000', keyEnv: 'ANTHROPIC_API_KEY' });
    expect(env.ANTHROPIC_API_KEY).toBe('sk-ant-their-own-0000000000');
    expect(env.OPENAI_API_KEY).toBeUndefined();
  });

  test('the owner keeps what they opted into', () => {
    const env = buildAgentEnv({ source, serverKeys: true });
    expect(env.ANTHROPIC_API_KEY).toBe(SERVER_KEY);
    expect(env.OPENAI_API_KEY).toBe('sk-openai-server-0000000000');
  });
});
