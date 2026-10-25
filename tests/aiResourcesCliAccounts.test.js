import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Account names for the coding CLIs in the AI resources window. Codex and
// Grok keep the account only inside their sign-in token files, which
// censaiOS never opens, so the owner is told why there is no name. A broken
// settings file shows no name and leaves one log line naming the CLI only.
// Fake people only.
const logLines = [];
jest.unstable_mockModule('../server/logger.js', () => ({
  createLogger: (name) => Object.fromEntries(['info', 'warn', 'error', 'debug'].map((level) => [level, (message, meta) => logLines.push({ name, level, message, meta })])),
}));

const { cliResources, cliAccountName } = await import('../server/aiResources/cliAccounts.js');

let home;
const write = (rel, text) => { fs.mkdirSync(path.dirname(path.join(home, rel)), { recursive: true }); fs.writeFileSync(path.join(home, rel), text); };
const roster = async () => ['claudecode', 'codex', 'gemini', 'grok'].map((id) => ({ id, label: id, installed: true, signedIn: true, signedInVia: 'cli-login', running: 0 }));

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-accounts-'));
  process.env.CENSAI_CLI_AGENT_HOME = home;
  logLines.length = 0;
  write('.claude.json', JSON.stringify({ oauthAccount: { emailAddress: 'pat@example.com' } }));
  // Stand-in sign-in files: they hold the account, and must never be opened.
  write('.codex/auth.json', JSON.stringify({ tokens: { id_token: 'FAKE' }, email: 'pat@example.com' }));
  write('.grok/auth.json', JSON.stringify([{ email: 'pat@example.com', token: 'FAKE' }]));
  write('.codex/config.toml', 'model = "stand-in"\n');
});

afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true });
  delete process.env.CENSAI_CLI_AGENT_HOME;
  jest.restoreAllMocks();
});

const byId = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]));

test('the owner sees the names the CLIs keep in settings, and why Codex and Grok have none', async () => {
  const read = jest.spyOn(fs, 'readFileSync');
  const rows = byId(await cliResources({ userId: 1, owner: true, roster, tasks: () => [] }));
  expect(rows.claudecode).toMatchObject({ account: 'pat@example.com', accountWithToken: false });
  expect(rows.codex).toMatchObject({ account: null, accountWithToken: true, accountHidden: false });
  expect(rows.grok).toMatchObject({ account: null, accountWithToken: true, accountHidden: false });
  expect(read.mock.calls.map(([file]) => String(file)).filter((file) => /auth\.json/.test(file))).toEqual([]);
});

test('a teammate sees every account hidden, and no reason that hints at one', async () => {
  const rows = byId(await cliResources({ userId: 2, owner: false, roster, tasks: () => [] }));
  for (const id of ['claudecode', 'codex', 'gemini', 'grok']) expect(rows[id]).toMatchObject({ account: null, accountHidden: true, accountWithToken: false });
});

test('a missing settings file shows no name and logs nothing; a broken one logs the CLI only', () => {
  expect(cliAccountName('gemini', home)).toBeNull();
  expect(logLines).toEqual([]);
  write('.gemini/google_accounts.json', '{ not json');
  expect(cliAccountName('gemini', home)).toBeNull();
  expect(logLines).toEqual([{ name: 'ai-resources', level: 'warn', message: 'could not read a CLI account name', meta: { cli: 'gemini' } }]);
  expect(JSON.stringify(logLines)).not.toMatch(/pat@|example/);
});
