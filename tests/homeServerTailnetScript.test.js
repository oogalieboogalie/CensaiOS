// scripts/home-server-tailnet.sh: on a home server censaiOS runs in Docker
// and cannot ask Tailscale anything, so the box writes the list of tailnet
// devices where censaiOS reads it. A stand-in `tailscale` answers here.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readFeed, FEED_FILE, FEED_MAX_AGE_MS } from '../server/tailnet/status.js';
import { parseTailnetStatus } from '../server/tailnet/parse.js';

const SCRIPT = path.resolve('scripts/home-server-tailnet.sh');
const linux = process.platform === 'linux';
const maybe = linux ? test : test.skip;
const ANSWER = {
  BackendState: 'Running',
  Self: { ID: 'nBOX', HostName: 'homebox', DNSName: 'homebox.tail1234.ts.net.', OS: 'linux', UserID: 1, TailscaleIPs: ['100.101.1.5'] },
  Peer: { k1: { ID: 'nPHONE', HostName: 'almas-phone', OS: 'android', UserID: 1, TailscaleIPs: ['100.101.1.2'], Online: true } },
  User: { 1: { LoginName: 'alma@example.com' } },
};

let tmp;
let bin;
let tools;
// The few programs the script needs. The run sees these and the stand-in
// and nothing else, so a real tailscale or crontab on the machine that runs
// the tests is never started (a build box often has Tailscale installed).
const NEEDED = ['bash', 'sh', 'dirname', 'mkdir', 'mv', 'rm', 'cat', 'grep', 'env'];

function linkTools(dir) {
  fs.mkdirSync(dir);
  for (const name of NEEDED) {
    const found = ['/usr/bin', '/bin', '/usr/local/bin'].map((folder) => path.join(folder, name)).find((file) => fs.existsSync(file));
    if (found) fs.symlinkSync(found, path.join(dir, name));
  }
}

function standInTailscale(body) {
  fs.writeFileSync(path.join(bin, 'tailscale'), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
}

function run(args, { withTailscale = true } = {}) {
  const PATH = withTailscale ? `${bin}${path.delimiter}${tools}` : tools;
  return spawnSync(path.join(tools, 'bash'), [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { PATH, HOME: tmp, CENSAI_HOME_DIR: path.join(tmp, 'censaiOS'), CENSAI_HOME_DRY_RUN: '1' },
  });
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'censai-tailnet-'));
  bin = path.join(tmp, 'bin');
  tools = path.join(tmp, 'tools');
  fs.mkdirSync(bin);
  if (linux) linkTools(tools);
  fs.mkdirSync(path.join(tmp, 'censaiOS'));
  standInTailscale(`[ "$1" = status ] && [ "$2" = --json ] && cat <<'JSON'\n${JSON.stringify(ANSWER)}\nJSON`);
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('is valid bash', () => {
  if (!linux) return;
  execFileSync('bash', ['-n', SCRIPT]);
});

maybe('writes the list where censaiOS reads it, readable by the owner only', () => {
  const result = run(['once']);
  expect(result.status).toBe(0);
  const stateDir = path.join(tmp, 'censaiOS', '.homebase-state');
  const file = path.join(stateDir, FEED_FILE);
  expect(fs.statSync(file).mode & 0o077).toBe(0);
  const feed = readFeed({ env: { HOMEBASE_STATE_DIR: stateDir } });
  const status = parseTailnetStatus(feed.raw);
  expect(status.connected).toBe(true);
  expect(status.self.name).toBe('homebox');
  expect(status.devices.map((d) => d.name)).toEqual(['almas-phone']);
});

maybe('turning it on writes the list and adds a once-a-minute timer line', () => {
  const result = run([]);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('* * * * *');
  expect(result.stdout).toContain('home-server-tailnet.sh" once');
  expect(fs.existsSync(path.join(tmp, 'censaiOS', '.homebase-state', FEED_FILE))).toBe(true);
});

maybe('says what to do when Tailscale is missing or silent, and writes nothing', () => {
  const missing = run(['once'], { withTailscale: false });
  expect(missing.status).toBe(1);
  expect(missing.stdout).toContain('Tailscale is not on this box');
  standInTailscale('exit 1');
  const silent = run(['once']);
  expect(silent.status).toBe(1);
  expect(silent.stdout).toContain('Tailscale gave no answer');
  expect(fs.existsSync(path.join(tmp, 'censaiOS', '.homebase-state', FEED_FILE))).toBe(false);
});

test('a list that stopped updating counts as no answer; no file at all means ask Tailscale itself', () => {
  const stateDir = path.join(tmp, 'state');
  fs.mkdirSync(stateDir);
  expect(readFeed({ env: { HOMEBASE_STATE_DIR: stateDir } })).toBeNull();
  const file = path.join(stateDir, FEED_FILE);
  fs.writeFileSync(file, JSON.stringify(ANSWER));
  expect(readFeed({ env: { HOMEBASE_STATE_DIR: stateDir } }).raw.Self.HostName).toBe('homebox');
  expect(readFeed({ env: { HOMEBASE_STATE_DIR: stateDir }, now: Date.now() + FEED_MAX_AGE_MS + 1000 })).toEqual({ reason: 'stale-feed' });
  fs.writeFileSync(file, 'not json');
  expect(readFeed({ env: { HOMEBASE_STATE_DIR: stateDir } })).toEqual({ reason: 'stale-feed' });
});
