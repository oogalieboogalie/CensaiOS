import { jest } from '@jest/globals';
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

// prepareArgs quotes any Windows argument that contains a space. The fake
// sits where the runner is, so it has to read the value Docker would see.
function asDockerArg(arg) {
  const s = String(arg);
  if (process.platform === 'win32' && s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
  return s;
}

// A tiny Docker engine: just enough for Run dev's argv.
function createEngine() {
  const containers = new Map();
  let nextPort = 49200;
  const images = new Set(['node:22-bookworm-slim']);
  const state = { answers: true, calls: [] };
  const ok = (stdout = '') => ({ stdout, stderr: '', code: 0 });
  const fail = (stderr) => ({ stdout: '', stderr, code: 1 });
  state.exec = (cmd, args) => {
    args = args.map(asDockerArg);
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
    expect(cleanFolderPath('/home/alma/shop/')).toBe('/home/alma/shop');
    expect(() => cleanFolderPath('')).toThrow(/Pick the project folder/);
    expect(() => cleanFolderPath('shop')).toThrow(/full folder path/);
    expect(() => cleanFolderPath('D:\\a,b')).toThrow(/cannot mount/);
  });

  test('Windows paths go to Docker Desktop\'s engine form when Homebase runs in a container', () => {
    expect(windowsToDesktopEngine('D:\\Sites\\my shop')).toBe('/run/desktop/mnt/host/d/Sites/my shop');
    expect(translateFolder('D:\\Sites\\shop', { platform: 'linux', inContainer: true, mounts: [] })).toBe('/run/desktop/mnt/host/d/Sites/shop');
    const winMounts = [{ source: 'D:\\Repos\\CensaiHub', destination: '/workspace/CensaiHub' }];
    expect(translateFolder('D:\\Sites\\shop', { platform: 'linux', inContainer: true, mounts: winMounts })).toBe('D:\\Sites\\shop');
    expect(translateFolder('D:\\Sites\\shop', { platform: 'win32' })).toBe('D:\\Sites\\shop');
  });

  test('a folder seen inside Homebase\'s container maps back to the real folder', () => {
    const mounts = [{ source: '/run/desktop/mnt/host/d/Repos/CensaiHub', destination: '/workspace/CensaiHub' }];
    expect(translateFolder('/workspace/CensaiHub/apps/site', { platform: 'linux', inContainer: true, mounts }))
      .toBe('/run/desktop/mnt/host/d/Repos/CensaiHub/apps/site');
    expect(() => translateFolder('/app/elsewhere', { platform: 'linux', inContainer: true, mounts })).toThrow(/runs inside Docker/);
    expect(translateFolder('/home/alma/shop', { platform: 'linux', inContainer: false })).toBe('/home/alma/shop');
  });
});

// Made-up folders. On Windows the dev server only accepts a drive path.
const hostPath = (folder) => (process.platform === 'win32' ? `D:${folder.replace(/\//g, '\\')}` : folder);

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
    const shop = hostPath('/home/alma/shop');
    const started = await manager.startDevServer({ folder: shop });
    expect(started).toMatchObject({ folder: shop, port: 3000, image: 'node:22-bookworm-slim' });
    await flush(); await flush(); await flush(); await flush();
    engine.answers = false;
    let s = await manager.devServerStatus(started.name);
    expect(s).toMatchObject({ phase: 'installing', url: 'http://localhost:49200' });
    engine.answers = true;
    s = await manager.devServerStatus(started.name);
    expect(s).toMatchObject({ phase: 'ready', url: 'http://localhost:49200', folder: shop });
    await manager.stopDevServer(started.name);
    expect((await manager.devServerStatus(started.name)).phase).toBe('stopped');
  });

  test('a missing image is downloaded first, and failures are reported, not thrown', async () => {
    const started = await manager.startDevServer({ folder: hostPath('/p/a'), image: 'node:20' });
    for (let i = 0; i < 8; i++) await flush();
    expect(exec.mock.calls.some(([, a]) => a[0] === 'pull' && a[1] === 'node:20')).toBe(true);
    engine.exec = () => ({ stdout: '', stderr: 'Cannot connect to the Docker daemon', code: 1 });
    const again = await manager.startDevServer({ folder: hostPath('/p/b') });
    for (let i = 0; i < 8; i++) await flush();
    expect(await manager.devServerStatus(again.name)).toMatchObject({ phase: 'error', reason: 'daemon-down' });
    expect(started.name).not.toBe(again.name);
  });

  test('bad input is refused before Docker is called', async () => {
    const bad = hostPath('/p/x');
    await expect(manager.startDevServer({ folder: bad, port: '99999' })).rejects.toThrow(/port/);
    await expect(manager.startDevServer({ folder: bad, image: '--privileged' })).rejects.toThrow(/Invalid image/);
    await expect(manager.startDevServer({ folder: bad, command: 'a\nb' })).rejects.toThrow(/one line/);
    await expect(manager.stopDevServer('homebase-app-1')).rejects.toThrow(/Only Run dev/);
    expect(exec).not.toHaveBeenCalled();
  });
});

describe('closing the window removes the container', () => {
  test('containers nobody pinged for two minutes are removed; pinged ones stay', async () => {
    const a = await manager.startDevServer({ folder: hostPath('/p/kept') });
    const b = await manager.startDevServer({ folder: hostPath('/p/closed') });
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
    // Windows npm runs the .cmd, so the shell script alone does not stop it.
    for (const bin of ['vite', 'next']) {
      const dest = path.join(dir, 'node_modules/.bin', bin);
      fs.writeFileSync(dest, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
      if (process.platform === 'win32') fs.writeFileSync(`${dest}.cmd`, '@exit /b 0\r\n');
    }
    const r = spawnSync(process.execPath, [launcher], { env: { ...process.env, CENSAI_APP_DIR: dir, PORT: '3000', CENSAI_DEV_CMD: '' }, encoding: 'utf8', timeout: 20_000 });
    if (process.platform === 'win32' && r.pid) spawnSync('taskkill', ['/F', '/T', '/PID', String(r.pid)], { stdio: 'ignore', windowsHide: true });
    // The process can exit and still hold the folder for a moment.
    for (let i = 0; i < 40; i += 1) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
        break;
      } catch (err) {
        if (i === 39 || (err?.code !== 'EBUSY' && err?.code !== 'EPERM')) throw err;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
      }
    }
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
    let testError = null;
    try {
      await new Promise((resolve, reject) => {
        child.stdout.on('data', (d) => { if (/Serving this folder/.test(String(d))) resolve(); });
        child.on('exit', () => reject(new Error('launcher stopped')));
      });
      const page = await fetch(`http://127.0.0.1:${port}/`);
      expect(await page.text()).toBe('<h1>Lead form</h1>');
      expect((await fetch(`http://127.0.0.1:${port}/style.css`)).headers.get('content-type')).toBe('text/css');
      expect((await fetch(`http://127.0.0.1:${port}/missing.js`)).status).toBe(404);
    } catch (err) {
      testError = err;
    } finally {
      child.kill();
      await new Promise((resolve) => {
        if (child.exitCode != null) resolve();
        else child.once('exit', () => resolve());
      });
    }
    // Windows keeps the folder locked for a moment after the process exits.
    for (let i = 0; i < 20; i += 1) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
        break;
      } catch (err) {
        if (i === 19 || (err?.code !== 'EBUSY' && err?.code !== 'EPERM')) {
          if (!testError) testError = err;
          break;
        }
        await new Promise((r) => setTimeout(r, 50));
      }
    }
    if (testError) throw testError;
  });

  test('explains a folder without package.json or without a dev script', () => {
    expect(runIn({ 'README.md': 'hi' }).stdout).toMatch(/no package\.json and no index\.html/);
    const r = runIn({ 'package.json': JSON.stringify({ scripts: { test: 'jest' } }) });
    expect(r.status).toBe(2);
    expect(r.stdout).toMatch(/no dev, start or serve script/);
  });
});
