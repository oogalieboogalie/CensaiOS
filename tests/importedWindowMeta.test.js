import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import express from 'express';
import request from 'supertest';
import { deriveManifestEntry, normalizeWindowMeta } from '../src/lib/windowMeta.js';
import { resolveHeaderMeta } from '../src/lib/windowHeader.js';
import { isWindowVisibleInModuleMenu } from '../src/lib/windowManifest.js';

// A window from the Window Importer, followed from the meta.js the importer
// writes to the manifest entry window:sync makes of it
// (scripts/window-sync.mjs): its header shows the Tools icon, it is no
// starting button, and it stays out of Add until someone publishes it. The
// Import Window used to offer an "Add to canvas launcher tiles" box, but the
// empty board only ever offers the windows in src/lib/launchpadStarts.js, so
// the box is gone and the importer decides the icon. The window, its code and
// the model's answer are made up; nothing is written into the app.
const real = await import('../server/window-import/windowPackageWriter.js');
const written = [];
const callModel = jest.fn();
jest.unstable_mockModule('../server/aiGateway/callModel.js', () => ({ callModel }));
jest.unstable_mockModule('../server/window-import/windowPackageWriter.js', () => ({
  ...real,
  writeWindowPackage: (plan) => { written.push(plan); return { dir: plan.windowDir }; },
  runWindowSync: async () => ({ ok: true, output: 'window-sync: made-up output' }),
}));
const { windowImportRouter } = await import('../server/routes/windowImport.js');

const JSX = 'export function MadeUpTipJarWindow() { return <div>Made-up tips</div>; }\nexport default MadeUpTipJarWindow;';
const ANSWER = { kind: 'madeUpTipJar', label: 'Made-up Tip Jar', jsx: JSX, css: '.made-up-tip-jar { color: var(--ink); }', defaultSize: { w: 420, h: 360 } };
const metaOf = (plan) => plan.files.find((file) => file.path.endsWith('meta.js')).source;

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imported-window-'));
afterAll(() => fs.rmSync(tempDir, { recursive: true, force: true }));

/** The manifest entry window:sync makes of an imported window's meta.js. */
async function syncedEntry(metaSource, name) {
  const file = path.join(tempDir, `${name}.js`);
  fs.writeFileSync(file, metaSource);
  const { windowMeta } = await import(pathToFileURL(file).href);
  return deriveManifestEntry(normalizeWindowMeta({ componentPath: `src/components/windows/${windowMeta.kind}/index.jsx`, ...windowMeta }));
}

function app() {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => { req.session = { userId: 1, userRole: 'admin' }; next(); });
  server.use('/api/windows', windowImportRouter);
  return server;
}

beforeEach(() => {
  written.length = 0;
  callModel.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(ANSWER) } }] });
});

test("an imported window's header shows its name and the Tools icon, and Add leaves it out until it is published", async () => {
  const res = await request(app()).post('/api/windows/import').send({ rawJsx: JSX, rawCss: '', hint: '' });
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ ok: true, kind: 'madeUpTipJar', label: 'Made-up Tip Jar', syncOk: true });
  expect(written).toHaveLength(1);

  const entry = await syncedEntry(metaOf(written[0]), 'plain');
  expect(resolveHeaderMeta(entry)).toMatchObject({ title: 'Made-up Tip Jar', icon: 'Tools' });
  // No starting button: the empty board lists only `show: true` launchers.
  expect(entry.launcher).toEqual({ show: false, icon: 'Tools' });
  expect(isWindowVisibleInModuleMenu(entry)).toBe(false);
});

test('a request that still names a launcher block (an Import Window opened before this change) gets the same window', async () => {
  const launcher = { show: true, order: 1, icon: 'Star', hint: 'made-up hint' };
  const res = await request(app()).post('/api/windows/import').send({ rawJsx: JSX, launcher });
  expect(res.status).toBe(200);
  const meta = metaOf(written[0]);
  expect(meta).not.toContain('Star');
  expect(meta).not.toContain('made-up hint');
  expect((await syncedEntry(meta, 'old-page')).launcher).toEqual({ show: false, icon: 'Tools' });
});
