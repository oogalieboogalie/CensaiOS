import path from 'node:path';
import { findChromium, whatIsMissing } from '../scripts/e2e/runner.mjs';

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
