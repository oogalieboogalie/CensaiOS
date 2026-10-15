import fs from 'fs';
import os from 'os';
import path from 'path';
import { claimCliLogin } from '../server/cli-agents/loginOwner.js';

const adapter = { id: 'claudecode', label: 'Claude Code', vendor: 'Anthropic' };

describe('CLI sign-in belongs to one person', () => {
  let dir;
  let file;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'login-owner-'));
    file = path.join(dir, 'cli-agents', 'login-owners.json');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('the first person to use the sign-in owns it; others must bring a key', () => {
    expect(claimCliLogin({ file, adapter, userId: 1, signedIn: true })).toBeNull();
    expect(claimCliLogin({ file, adapter, userId: 1, signedIn: true })).toBeNull();
    const blocked = claimCliLogin({ file, adapter, userId: 2, signedIn: true });
    expect(blocked).toMatch(/another person's Anthropic account/);
    expect(blocked).toMatch(/API key/);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ claudecode: 1 });
  });

  test('signing out drops the claim so the next person can sign in', () => {
    claimCliLogin({ file, adapter, userId: 1, signedIn: true });
    expect(claimCliLogin({ file, adapter, userId: 2, signedIn: false })).toBeNull();
    expect(claimCliLogin({ file, adapter, userId: 2, signedIn: true })).toBeNull();
    expect(claimCliLogin({ file, adapter, userId: 1, signedIn: true })).toMatch(/another person/);
  });

  test('each CLI has its own owner', () => {
    claimCliLogin({ file, adapter, userId: 1, signedIn: true });
    const codex = { id: 'codex', label: 'Codex', vendor: 'OpenAI' };
    expect(claimCliLogin({ file, adapter: codex, userId: 2, signedIn: true })).toBeNull();
  });
});
