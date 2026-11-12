import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import { findChromium, freePort, runPorts, whatIsMissing } from '../scripts/e2e/runner.mjs';

const chrome = path.join('/pw', 'chromium-1194', 'chrome-linux', 'chrome');

function fakePg(works) {
  return {
    Client: class {
      async connect() { if (!works) throw new Error('no database'); }
      async query() { return { rows: [] }; }
      async end() {}
    },
  };
}

describe('end-to-end runner checks', () => {
  it('finds Chromium in the Playwright browser folder, newest build first', () => {
    const files = new Set(['/pw', chrome, path.join('/pw', 'chromium-1100', 'chrome-linux', 'chrome')]);
    const found = findChromium(
      { PLAYWRIGHT_BROWSERS_PATH: '/pw' },
      (p) => files.has(p),
      () => ['chromium-1100', 'chromium-1194', 'ffmpeg-1011'],
    );
    expect(found).toBe(chrome);
  });

  it('uses CHROMIUM_PATH when set and nothing when there is no browser', () => {
    expect(findChromium({ CHROMIUM_PATH: '/x/chrome' }, (p) => p === '/x/chrome')).toBe('/x/chrome');
    expect(findChromium({}, () => false)).toBeNull();
  });

  it('names what this runner is missing', async () => {
    expect(await whatIsMissing({ env: {}, chromium: null, pg: fakePg(true) })).toBe('database and browser');
    expect(await whatIsMissing({ env: { E2E_DATABASE_URL: 'postgresql://x' }, chromium: null, pg: fakePg(false) })).toBe('database and browser');
    expect(await whatIsMissing({ env: { E2E_DATABASE_URL: 'postgresql://x' }, chromium: chrome, pg: fakePg(true) })).toBe('');
  });
});

// Every run used to start its own copy of the app on the same two ports. Two
// runs on one machine then shared one app: the second found the first one
// already answering and marked that window instead of its own.
describe('each run gets its own two ports', () => {
  it('hands out a port that is free to listen on', async () => {
    const port = await freePort();
    expect(port).toBeGreaterThan(1023);
    await new Promise((resolve, reject) => {
      const server = net.createServer();
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => server.close(resolve));
    });
  });

  it('gives two runs different ports, and one run two different ports', async () => {
    const [a, b] = await Promise.all([runPorts({ env: {} }), runPorts({ env: {} })]);
    expect(new Set([a.api, a.web, b.api, b.web]).size).toBe(4);
  });

  it('asks again when the second port comes back the same as the first', async () => {
    const answers = [4100, 4100, 4100, 4200];
    const ports = await runPorts({ env: {}, pick: async () => answers.shift() });
    expect(ports).toEqual({ api: 4100, web: 4200 });
    await expect(runPorts({ env: {}, pick: async () => 4100 })).rejects.toThrow('two different free ports');
  });

  it('uses fixed ports when a run names them, and ignores ones that are not ports', async () => {
    expect(await runPorts({ env: { E2E_API_PORT: '3001', E2E_WEB_PORT: '5173' }, pick: async () => 1 })).toEqual({ api: 3001, web: 5173 });
    const answers = [4100, 4200];
    expect(await runPorts({ env: { E2E_API_PORT: 'abc', E2E_WEB_PORT: '99999' }, pick: async () => answers.shift() })).toEqual({ api: 4100, web: 4200 });
  });

  it('no run starts the app on a port typed in by hand, and the dev server follows the run', () => {
    const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');
    for (const file of ['scripts/test-team/run.mjs', 'scripts/e2e/two-people.mjs']) {
      const text = read(file);
      expect(text).toContain('await runPorts()');
      expect(text).toContain('CENSAI_DEV_API_PORT: String(API_PORT)');
      expect(text).not.toMatch(/API_PORT = 3001|'5173'|WEB_PORT = 5173/);
    }
    const vite = read('vite.config.js');
    expect(vite).toContain('process.env.CENSAI_DEV_API_PORT');
    expect(vite).not.toContain('127.0.0.1:3001');
  });
});
