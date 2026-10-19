import { jest } from '@jest/globals';
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

// A tiny Docker engine: just enough for Run dev's argv.
function createEngine() {
  const containers = new Map();
  let nextPort = 49200;
  const images = new Set(['node:22-bookworm-slim']);
  const state = { answers: true, calls: [] };
  const ok = (stdout = '') => ({ stdout, stderr: '', code: 0 });
  const fail = (stderr) => ({ stdout: '', stderr, code: 1 });
  state.exec = (cmd, args) => {
    state.calls.push(args);
    const [verb, ...rest] = args;
    if (verb === 'image') return images.has(rest[1]) ? ok('[]') : fail('Error: No such image');
    if (verb === 'pull') { images.add(rest[0]); return ok(); }
    if (verb === 'rm') {
      const name = rest[rest.length - 1];
      return containers.delete(name) ? ok(name) : fail(`Error response from daemon: No such container: ${name}`);
    }
    if (verb === 'run') {
      const name = args[args.indexOf('--name') + 1];
      const labels = args.filter((a, i) => args[i - 1] === '--label').join(',');
      const port = Number(args.find((a) => a.startsWith('PORT=')).slice(5));
      containers.set(name, { Names: name, State: 'running', Status: 'Up 1 second', Labels: labels, Ports: `127.0.0.1:${nextPort++}->${port}/tcp` });
      return ok('abc123');
    }
    if (verb === 'ps') return ok([...containers.values()].map((c) => JSON.stringify(c)).join('\n'));
    if (verb === 'exec') return state.answers ? ok() : fail('fetch failed');
    if (verb === 'inspect') return ok('[]');
    return fail(`unknown verb ${verb}`);
  };
  state.containers = containers;
  return state;
}

let engine = createEngine();
const exec = jest.fn((cmd, args) => Promise.resolve(engine.exec(cmd, args)));
jest.unstable_mockModule('../runner/client.js', () => ({ runnerClient: { exec } }));

const manager = await import('./manager.js');
const reaper = await import('./reaper.js');
const { translateFolder, cleanFolderPath, windowsToDesktopEngine } = await import('./hostPath.js');

const flush = () => new Promise((r) => setTimeout(r, 0));
beforeEach(() => { engine = createEngine(); exec.mockClear(); reaper.resetReaperForTests(); });

describe('folder paths', () => {
  test('cleans quotes and trailing slashes, refuses relative or unmountable paths', () => {
    expect(cleanFolderPath('"D:\\Sites\\shop\\"')).toBe('D:\\Sites\\shop');
    expect(cleanFolderPath('/home/alex/shop/')).toBe('/home/alex/shop');
    expect(() => cleanFolderPath('')).toThrow(/Pick the project folder/);
    expect(() => cleanFolderPath('shop')).toThrow(/full folder path/);
    expect(() => cleanFolderPath('D:\\a,b')).toThrow(/cannot mount/);
  });

  test('Windows paths go to Docker Desktop\'s engine form when Homebase runs in a container', () => {
    expect(windowsToDesktopEngine('D:\\Sites\\my shop')).toBe('/run/desktop/mnt/host/d/Sites/my shop');
    expect(translateFolder('D:\\Sites\\shop', { platform: 'linux', inContainer: true, mounts: [] })).toBe('/run/desktop/mnt/host/d/Sites/shop');
    const winMounts = [{ source: 'D:\\Homebase\\CensaiHub', destination: '/workspace/CensaiHub' }];
    expect(translateFolder('D:\\Sites\\shop', { platform: 'linux', inContainer: true, mounts: winMounts })).toBe('D:\\Sites\\shop');
    expect(translateFolder('D:\\Sites\\shop', { platform: 'win32' })).toBe('D:\\Sites\\shop');
  });

  test('a folder seen inside Homebase\'s container maps back to the real folder', () => {
    const mounts = [{ source: '/run/desktop/mnt/host/d/Homebase/CensaiHub', destination: '/workspace/CensaiHub' }];
    expect(translateFolder('/workspace/CensaiHub/apps/site', { platform: 'linux', inContainer: true, mounts }))
      .toBe('/run/desktop/mnt/host/d/Homebase/CensaiHub/apps/site');
    expect(() => translateFolder('/app/elsewhere', { platform: 'linux', inContainer: true, mounts })).toThrow(/runs inside Docker/);
    expect(translateFolder('/home/alex/shop', { platform: 'linux', inContainer: false })).toBe('/home/alex/shop');
  });
});

describe('the dev-server container', () => {
  test('one stable container per project folder', () => {
    expect(manager.containerName('D:\\Sites\\Corner Bakery')).toMatch(/^censai-dev-corner-bakery-[0-9a-f]{10}$/);
    expect(manager.containerName('D:\\Sites\\shop')).toBe(manager.containerName('d:/sites/shop'));
    expect(manager.containerName('D:\\a\\shop')).not.toBe(manager.containerName('D:\\b\\shop'));
  });

  test('run mounts the folder, keeps packages in a volume and publishes on 127.0.0.1 only', () => {
    const args = manager.runArgs({ name: 'censai-dev-x-1', folder: '/p/x', engineFolder: '/p/x', image: 'node:22-bookworm-slim', command: 'npm run dev --x', port: 5173 });
    expect(args).toEqual(expect.arrayContaining([
      'type=bind,source=/p/x,target=/app', '-p', '127.0.0.1::5173', 'PORT=5173', 'CENSAI_DEV_CMD=npm run dev --x', 'censai.devserver=1',
    ]));
    expect(args.find((a) => a.startsWith('type=volume'))).toMatch(/censai-dev-packages-[0-9a-f]{10},target=\/app\/node_modules/);
    // The typed command only ever travels as an environment value.
    expect(args.indexOf('npm run dev --x')).toBe(-1);
  });

  test('start, wait for the site to answer, stop', async () => {
    const started = await manager.startDevServer({ folder: '/home/alex/shop' });
    expect(started).toMatchObject({ folder: '/home/alex/shop', port: 3000, image: 'node:22-bookworm-slim' });
    await flush(); await flush(); await flush(); await flush();
    engine.answers = false;
    let s = await manager.devServerStatus(started.name);
    expect(s).toMatchObject({ phase: 'installing', url: 'http://localhost:49200' });
    engine.answers = true;
    s = await manager.devServerStatus(started.name);
    expect(s).toMatchObject({ phase: 'ready', url: 'http://localhost:49200', folder: '/home/alex/shop' });
    await manager.stopDevServer(started.name);
    expect((await manager.devServerStatus(started.name)).phase).toBe('stopped');
  });

  test('a missing image is downloaded first, and failures are reported, not thrown', async () => {
    const started = await manager.startDevServer({ folder: '/p/a', image: 'node:20' });
    for (let i = 0; i < 8; i++) await flush();
    expect(exec.mock.calls.some(([, a]) => a[0] === 'pull' && a[1] === 'node:20')).toBe(true);
    engine.exec = () => ({ stdout: '', stderr: 'Cannot connect to the Docker daemon', code: 1 });
    const again = await manager.startDevServer({ folder: '/p/b' });
    for (let i = 0; i < 8; i++) await flush();
    expect(await manager.devServerStatus(again.name)).toMatchObject({ phase: 'error', reason: 'daemon-down' });
    expect(started.name).not.toBe(again.name);
  });

  test('bad input is refused before Docker is called', async () => {
    await expect(manager.startDevServer({ folder: '/p/x', port: '99999' })).rejects.toThrow(/port/);
    await expect(manager.startDevServer({ folder: '/p/x', image: '--privileged' })).rejects.toThrow(/Invalid image/);
    await expect(manager.startDevServer({ folder: '/p/x', command: 'a\nb' })).rejects.toThrow(/one line/);
    await expect(manager.stopDevServer('homebase-app-1')).rejects.toThrow(/Only Run dev/);
    expect(exec).not.toHaveBeenCalled();
  });
});

describe('closing the window removes the container', () => {
  test('containers nobody pinged for two minutes are removed; pinged ones stay', async () => {
    const a = await manager.startDevServer({ folder: '/p/kept' });
    const b = await manager.startDevServer({ folder: '/p/closed' });
    for (let i = 0; i < 12; i++) await flush();
    const later = Date.now() + reaper.IDLE_MS + 1000;
    jest.spyOn(Date, 'now').mockReturnValue(later);
    reaper.heartbeat([a.name]);
    const removed = await reaper.reapIdle(later);
    Date.now.mockRestore();
    expect(removed).toEqual([b.name]);
    expect([...engine.containers.keys()]).toEqual([a.name]);
  });
});

describe('the launcher inside the container', () => {
  const launcher = path.join(path.dirname(fileURLToPath(import.meta.url)), 'launcher.cjs');
  const runIn = (files) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rundev-'));
    for (const [name, body] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      fs.writeFileSync(path.join(dir, name), body);
    }
    // Pretend packages are installed so nothing touches the network.
    const inputs = ['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock']
      .filter((f) => fs.existsSync(path.join(dir, f)))
      .map((f) => { const st = fs.statSync(path.join(dir, f)); return `${f}:${st.size}:${st.mtimeMs}`; }).join('|');
    fs.mkdirSync(path.join(dir, 'node_modules/.bin'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'node_modules/.censai-install-stamp'), inputs);
    // Stand-in dev tools that exit at once. Without them the real Vite from
    // this repo starts, outlives the test and holds ports 3000 and 3001.
    for (const bin of ['vite', 'next']) fs.writeFileSync(path.join(dir, 'node_modules/.bin', bin), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const r = spawnSync(process.execPath, [launcher], { env: { ...process.env, CENSAI_APP_DIR: dir, PORT: '3000', CENSAI_DEV_CMD: '' }, encoding: 'utf8', timeout: 20_000 });
    fs.rmSync(dir, { recursive: true, force: true });
    return r;
  };

  test('finds the dev script and makes Vite listen where Docker forwards', () => {
    const r = runIn({ 'package.json': JSON.stringify({ scripts: { dev: 'vite' } }) });
    expect(r.stdout).toContain('[censai] Packages are up to date.');
    expect(r.stdout).toContain('[censai] Starting: npm run dev -- --host 0.0.0.0 --port 3000');
  });

  test('Next.js with pnpm gets its own flags, without npm\'s "--"', () => {
    const r = runIn({ 'package.json': JSON.stringify({ scripts: { dev: 'next dev' } }), 'pnpm-lock.yaml': 'lockfileVersion: 9' });
    expect(r.stdout).toContain('[censai] Starting: pnpm run dev -H 0.0.0.0 -p 3000');
  });

  test('a folder of plain pages (no package.json) is served as it is', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rundev-plain-'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<h1>Lead form</h1>');
    fs.writeFileSync(path.join(dir, 'style.css'), 'h1{}');
    const port = String(41000 + Math.floor(Math.random() * 2000));
    const child = spawn(process.execPath, [launcher], { env: { ...process.env, CENSAI_APP_DIR: dir, PORT: port, CENSAI_DEV_CMD: '' } });
    try {
      await new Promise((resolve, reject) => {
        child.stdout.on('data', (d) => { if (/Serving this folder/.test(String(d))) resolve(); });
        child.on('exit', () => reject(new Error('launcher stopped')));
      });
      const page = await fetch(`http://127.0.0.1:${port}/`);
      expect(await page.text()).toBe('<h1>Lead form</h1>');
      expect((await fetch(`http://127.0.0.1:${port}/style.css`)).headers.get('content-type')).toBe('text/css');
      expect((await fetch(`http://127.0.0.1:${port}/missing.js`)).status).toBe(404);
    } finally {
      child.kill();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('explains a folder without package.json or without a dev script', () => {
    expect(runIn({ 'README.md': 'hi' }).stdout).toMatch(/no package\.json and no index\.html/);
    const r = runIn({ 'package.json': JSON.stringify({ scripts: { test: 'jest' } }) });
    expect(r.status).toBe(2);
    expect(r.stdout).toMatch(/no dev, start or serve script/);
  });
});
