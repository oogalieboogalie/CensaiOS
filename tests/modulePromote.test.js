import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import express from 'express';
import request from 'supertest';
import {
  buildPromotionPlan, kebabFromKind, kindFromName, withStyleImport, writePromotion,
} from '../server/window-import/promoteModule.js';
import { deriveManifestEntry, normalizeWindowMeta } from '../src/lib/windowMeta.js';
import { promoteModuleHandler } from '../server/routes/modulePromote.js';
import { requireLocalFilesystem } from '../server/middleware/runtimeMode.js';

// index.css lines, built so the tracked-imports check doesn't read them as imports.
const imp = (name) => `@import './styles/${name}';`;

const manifest = { name: 'Tip calculator', description: 'Split a bill and tip across a crew.', icon: 'Toolbox', size: { w: 400, h: 500 }, permissions: ['agent'] };
const source = '<div style="color: var(--ink)">Tip `${x}` </script-ish>  </div><script>censai.toast("hi")</script>';

function tempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'promote-'));
  fs.mkdirSync(path.join(root, 'src', 'components', 'windows'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', 'styles'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'index.css'), `${imp('tokens.css')}\n${imp('games.css')}\n\n:root { color: red; }\n`);
  return root;
}

test('names become window ids and stylesheet names', () => {
  expect(kindFromName('Tip calculator')).toBe('tipCalculator');
  expect(kindFromName('Open-house sign in sheet!')).toBe('openHouseSignInSheet');
  expect(kindFromName('3D viewer')).toBe('module3dViewer');
  expect(kebabFromKind('openHouseSignIn')).toBe('open-house-sign-in');
});

test('the @import line goes after the last import, once', () => {
  const css = `${imp('tokens.css')}\n${imp('games.css')}\n\nbody {}\n`;
  const once = withStyleImport(css, 'tip-calculator.css');
  expect(once.split('\n').slice(0, 3)).toEqual([imp('tokens.css'), imp('games.css'), imp('tip-calculator.css')]);
  expect(withStyleImport(once, 'tip-calculator.css')).toBe(once);
});

test('a promotion writes a folder window with the same conventions as the others', async () => {
  const root = tempRoot();
  const plan = buildPromotionPlan({ manifest, source, request: 'a tip calculator', libraryId: 'lib-1' }, { root, now: new Date('2026-10-08T06:00:00Z') });
  expect(plan).toMatchObject({ kind: 'tipCalculator', label: 'Tip calculator', componentName: 'TipCalculatorWindow', stylesheet: 'tip-calculator.css' });
  expect(plan.relativeFiles).toEqual([
    { path: 'src/components/windows/tipCalculator/meta.js', edit: false },
    { path: 'src/components/windows/tipCalculator/index.jsx', edit: false },
    { path: 'src/components/windows/tipCalculator/module.js', edit: false },
    { path: 'src/styles/tip-calculator.css', edit: false },
    { path: 'src/index.css', edit: true },
  ]);
  writePromotion(plan);

  const dir = path.join(root, 'src', 'components', 'windows', 'tipCalculator');
  const { windowMeta } = await import(pathToFileURL(path.join(dir, 'meta.js')).href);
  const entry = deriveManifestEntry(normalizeWindowMeta(windowMeta));
  expect(entry).toMatchObject({
    kind: 'tipCalculator',
    componentName: 'TipCalculatorWindow',
    componentPath: 'src/components/windows/tipCalculator/index.jsx',
    defaultSize: { w: 400, h: 500 },
  });
  // In the Add menu like a first-party window.
  expect(entry.moduleMenu).toMatchObject({ show: true, status: 'ready', label: 'Tip calculator', icon: 'Toolbox', hint: 'Split a bill and tip across a crew.' });
  expect(windowMeta.promotedFrom).toEqual({ at: '2026-10-08T06:00:00.000Z', libraryId: 'lib-1' });

  // The code survives byte for byte, even characters that break JS strings.
  const mod = await import(pathToFileURL(path.join(dir, 'module.js')).href);
  expect(mod.moduleSource).toBe(source);
  // A v1 manifest is promoted as v3 (it keeps storage and presence, which v1 modules always had).
  expect(mod.moduleManifest).toMatchObject({ manifest: 3, name: 'Tip calculator', permissions: ['storage', 'presence', 'agent'] });
  expect(mod.moduleRequest).toBe('a tip calculator');

  const index = fs.readFileSync(path.join(dir, 'index.jsx'), 'utf8');
  expect(index).toContain("import { PromotedModuleWindow } from '../../modules/PromotedModuleWindow.jsx';");
  expect(index).toContain('export function TipCalculatorWindow(props)');
  expect(index).toContain('className="hb-tip-calculator"');
  const css = fs.readFileSync(path.join(root, 'src', 'styles', 'tip-calculator.css'), 'utf8');
  expect(css).toContain('.hb-tip-calculator');
  expect(css).not.toMatch(/#[0-9a-f]{3,6}\b/i);
  expect(fs.readFileSync(path.join(root, 'src', 'index.css'), 'utf8')).toContain(`${imp('games.css')}\n${imp('tip-calculator.css')}`);
});

test('a promotion never replaces an existing window', () => {
  const root = tempRoot();
  expect(() => buildPromotionPlan({ manifest, source }, { root, existingKinds: ['tipCalculator'] })).toThrow(/already exists/);
  fs.mkdirSync(path.join(root, 'src', 'components', 'windows', 'flashCards'));
  expect(() => buildPromotionPlan({ manifest, source, kind: 'flashCards' }, { root })).toThrow(/already exists/);
  expect(() => buildPromotionPlan({ manifest, source, kind: '../evil' }, { root })).toThrow(/must start with a letter/);
  expect(() => buildPromotionPlan({ manifest, source: '  ' }, { root })).toThrow(/no module/);
});

function app(role) {
  const a = express();
  a.use(express.json({ limit: '2mb' }));
  a.use((req, _res, next) => { req.session = { userId: 1, userRole: role }; next(); });
  a.post('/api/modules/promote', requireLocalFilesystem, promoteModuleHandler);
  return a;
}

test('anyone can preview a promotion; only the owner can write one', async () => {
  const preview = await request(app('user')).post('/api/modules/promote').send({ manifest, source, dryRun: true });
  expect(preview.status).toBe(200);
  expect(preview.body).toMatchObject({ ok: true, dryRun: true, kind: 'tipCalculator' });
  expect(preview.body.files.map(f => f.path)).toContain('src/components/windows/tipCalculator/module.js');

  const write = await request(app('user')).post('/api/modules/promote').send({ manifest, source });
  expect(write.status).toBe(403);
  expect(write.body.error).toMatch(/Only the owner/);
});

test('a promotion that would clash with a shipped window is refused before writing', async () => {
  const res = await request(app('admin')).post('/api/modules/promote').send({ manifest, source, kind: 'asteroids', dryRun: true });
  expect(res.status).toBe(409);
  expect(res.body.code).toBe('PROMOTE_KIND_TAKEN');
});

test('the hosted cloud never writes into its own code', async () => {
  const before = process.env.CENSAI_MODE;
  process.env.CENSAI_MODE = 'cloud_saas';
  try {
    const res = await request(app('admin')).post('/api/modules/promote').send({ manifest, source, dryRun: true });
    expect(res.status).toBe(403);
  } finally {
    if (before === undefined) delete process.env.CENSAI_MODE; else process.env.CENSAI_MODE = before;
  }
});
