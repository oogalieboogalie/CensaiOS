import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { zipSync, strToU8 } from 'fflate';
import { buildWebPlan, normalizePath, resolveRef, rewriteText, rerootFiles, token } from '../src/lib/games/playground/virtualSite.js';
import { classifyFiles, classifyUrl, frameSandbox, godotNeedsThreads, threeImportMap } from '../src/lib/games/playground/classify.js';
import { SAMPLES, planFromFiles, planFromSample, sanitizeRecord, themeLua } from '../src/lib/games/playground/catalog.js';
import { PLAYGROUND_PREFIX, playgroundHeaders, resolveThreeVendor } from '../server/boot/playgroundAssets.js';
import { buildAddSections } from '../src/lib/modules/addPaletteItems.js';
import { WINDOW_MANIFESTS as FACTORY_WINDOWS } from '../src/lib/windowManifest.js';
import { hasGameCover } from '../src/components/games/GameCover.jsx';

const { understand } = await import('../src/components/windows/gamePlayground/gameFiles.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bytes = (s) => new TextEncoder().encode(s);

describe('virtual site rewriting', () => {
  test('paths normalize and references resolve inside the build only', () => {
    expect(normalizePath('./a//b/../c.js')).toBe('a/c.js');
    expect(normalizePath('C:\\game\\index.html')).toBe('C:/game/index.html');
    expect(resolveRef('js/main.js', '../assets/a.png?v=2#x')).toBe('assets/a.png');
    expect(resolveRef('index.html', 'https://cdn.example.com/x.js')).toBeNull();
    expect(resolveRef('index.html', '/abs.js')).toBeNull();
    expect(resolveRef('index.html', 'data:image/png;base64,AAAA')).toBeNull();
    expect(resolveRef('index.html', '#top')).toBeNull();
  });

  test('a page swaps scripts, styles, import maps and inline imports for tokens', () => {
    const known = new Set(['index.html', 'index.js', 'style.css', 'lib/three.js', 'img/bg.png', 'scene.js']);
    const html = [
      '<script type="importmap">{"imports":{"three":"./lib/three.js","cdn":"https://x.dev/a.js"}}</script>',
      '<link rel="stylesheet" href="style.css"><script id="index.js" src="index.js"></script>',
      '<img src="img/bg.png"><img src="missing.png"><script src="https://cdn.dev/x.js"></script>',
      '<script type="module">import { go } \u0066rom "./scene.js"; go();</script>',
      '<style>body{background:url(img/bg.png)}</style>',
    ].join('\n');
    const { text, deps } = rewriteText('index.html', html, known);
    expect(text).toContain(`"three":"${token('lib/three.js')}"`);
    expect(text).toContain('"cdn":"https://x.dev/a.js"');
    expect(text).toContain(`<script id="index.js" src="${token('index.js')}">`);
    expect(text).toContain(`href="${token('style.css')}"`);
    expect(text).toContain('src="missing.png"');
    expect(text).toContain('src="https://cdn.dev/x.js"');
    expect(text).toContain(`from "${token('scene.js')}"`);
    expect(text).toContain(`url(${token('img/bg.png')})`);
    expect(new Set(deps)).toEqual(new Set(['lib/three.js', 'index.js', 'style.css', 'img/bg.png', 'scene.js']));
  });

  test('modules rewrite static, dynamic and new URL references relative to themselves', () => {
    const known = new Set(['src/main.js', 'src/util.js', 'lib/x.js', 'assets/a.glb']);
    // Escaped so the tracked-imports scanner doesn't read the fixture as real imports.
    const js = "import a \u0066rom './util.js';\nexport * \u0066rom '../lib/x.js';\nconst m = \u0069mport('./util.js');\nimport * as THREE from 'three';\nconst u = new URL('../assets/a.glb', import.meta.url);";
    const { text, deps } = rewriteText('src/main.js', js, known);
    expect(text).toContain(`from '${token('src/util.js')}'`);
    expect(text).toContain(`from '${token('lib/x.js')}'`);
    expect(text).toContain(`import('${token('src/util.js')}')`);
    expect(text).toContain("from 'three'");
    expect(text).toContain(`new URL('${token('assets/a.glb')}', import.meta.url)`);
    expect(deps.sort()).toEqual(['assets/a.glb', 'lib/x.js', 'src/util.js']);
  });

  test('a web plan keeps binaries as bytes and text as rewritten text', () => {
    const plan = buildWebPlan([
      { path: 'index.html', data: bytes('<script src="index.js"></script>') },
      { path: 'index.js', data: bytes("fetch('index.wasm')") },
      { path: 'index.wasm', data: new Uint8Array([0, 97, 115, 109]) },
    ], 'index.html');
    expect(plan.kind).toBe('web');
    const byPath = Object.fromEntries(plan.files.map((f) => [f.path, f]));
    expect(byPath['index.html'].text).toContain(token('index.js'));
    expect(byPath['index.html'].deps).toEqual(['index.js']);
    expect(byPath['index.wasm'].type).toBe('application/wasm');
    expect(byPath['index.wasm'].data).toBeInstanceOf(Uint8Array);
    expect(byPath['index.js'].type).toBe('text/javascript');
  });

  test('rerooting drops the shared top folder and anything outside it', () => {
    expect(rerootFiles([{ path: 'Game/index.html' }, { path: 'Game/a/b.png' }, { path: 'other.txt' }], 'Game/').map((f) => f.path)).toEqual(['index.html', 'a/b.png']);
  });
});

describe('what was dropped', () => {
  const f = (p, data = '') => ({ path: p, data: bytes(data) });

  test('single files', () => {
    expect(classifyFiles([f('pong.love')])).toMatchObject({ engine: 'love', mode: 'love-file' });
    expect(classifyFiles([f('build.zip')])).toMatchObject({ mode: 'zip' });
    expect(classifyFiles([f('scene.js')])).toMatchObject({ engine: 'three', mode: 'scene' });
    expect(classifyFiles([f('game.html')])).toMatchObject({ engine: 'web', mode: 'web', entry: 'game.html' });
    expect(classifyFiles([f('notes.txt')]).error).toBeTruthy();
    expect(classifyFiles([]).error).toBeTruthy();
  });

  test('a LÖVE folder roots at main.lua; junk is ignored', () => {
    const info = classifyFiles([f('Pong/main.lua'), f('Pong/conf.lua'), f('Pong/lib/ball.lua'), f('__MACOSX/Pong/._main.lua'), f('Pong/.DS_Store')]);
    expect(info).toMatchObject({ engine: 'love', mode: 'love-files', root: 'Pong/' });
  });

  test('a Godot export is recognised by its .pck and threads are flagged', () => {
    const html = '<script>const GODOT_CONFIG = {}; const GODOT_THREADS_ENABLED = true;</script>';
    const list = [f('Export/index.html', html), f('Export/index.js'), f('Export/index.wasm'), f('Export/index.pck')];
    const info = classifyFiles(list, { readText: (p) => (p === 'Export/index.html' ? html : '') });
    expect(info).toMatchObject({ engine: 'godot', mode: 'web', root: 'Export/', entry: 'index.html' });
    expect(info.note).toMatch(/Thread Support/);
    expect(godotNeedsThreads('const GODOT_THREADS_ENABLED = false;', ['index.worker.js'])).toBe(false);
    expect(godotNeedsThreads('', ['index.worker.js'])).toBe(true);
  });

  test('a plain HTML5 build prefers index.html', () => {
    expect(classifyFiles([f('site/about.html'), f('site/index.html'), f('site/app.js')])).toMatchObject({ engine: 'web', root: 'site/', entry: 'index.html' });
  });

  test('zips are opened and classified again', () => {
    const zip = zipSync({ 'Pong/main.lua': strToU8('function love.draw() end'), 'Pong/conf.lua': strToU8('') });
    const { list, info } = understand([{ path: 'pong.zip', data: zip }]);
    expect(info).toMatchObject({ engine: 'love', mode: 'love-files', root: 'Pong/' });
    expect(list.map((x) => x.path).sort()).toEqual(['Pong/conf.lua', 'Pong/main.lua']);
  });

  test('links', () => {
    expect(classifyUrl('https://x.dev/games/pong.love')).toMatchObject({ engine: 'love', mode: 'fetch-love', name: 'pong.love' });
    expect(classifyUrl('x.dev/build.zip')).toMatchObject({ mode: 'fetch-zip', url: 'https://x.dev/build.zip' });
    expect(classifyUrl('https://user.itch.io/game')).toMatchObject({ mode: 'frame', name: 'user.itch.io' });
    expect(classifyUrl('javascript:alert(1)').error).toBeTruthy();
    expect(classifyUrl('ftp://x.dev/a.love').error).toBeTruthy();
  });

  test('our own origin never gets allow-same-origin', () => {
    expect(frameSandbox('https://os.censai.app/playground/x.html', 'https://os.censai.app')).not.toContain('allow-same-origin');
    expect(frameSandbox('https://html.itch.zone/game/index.html', 'https://os.censai.app')).toContain('allow-same-origin');
    expect(frameSandbox('not a url', 'https://os.censai.app')).not.toContain('allow-same-origin');
  });
});

describe('plans and the shared record', () => {
  test('the shared record keeps only safe fields', () => {
    expect(sanitizeRecord({ source: { type: 'sample', id: 'love-breakout' }, by: 'Sam', at: 5 })).toMatchObject({ engine: 'love', title: 'Breakout', by: 'Sam', at: 5 });
    expect(sanitizeRecord({ source: { type: 'sample', id: 'nope' } })).toBeNull();
    expect(sanitizeRecord({ engine: 'godot', source: { type: 'url', url: 'javascript:alert(1)' } })).toBeNull();
    expect(sanitizeRecord({ engine: 'evil', source: { type: 'url', url: 'https://x.dev/g' }, title: 'G' })).toMatchObject({ engine: 'web' });
    expect(sanitizeRecord({ engine: 'love', source: { type: 'local', name: 'Pong', path: '/secret' } }).source).toEqual({ type: 'local', name: 'Pong' });
    expect(sanitizeRecord(null)).toBeNull();
  });

  test('LÖVE plans: a .love goes in as game.love; loose files get the board theme', () => {
    const love = planFromFiles([{ path: 'pong.love', data: new Uint8Array([80, 75]) }], { mode: 'love-file', entry: 'pong.love' });
    expect(love).toMatchObject({ kind: 'love', args: ['./game.love'] });
    expect(love.files[0].path).toBe('game.love');
    const theme = { bg: '#101010', ink: '#ffffff', soft: '#999999', faint: '#444444', accent: '#3366ff' };
    const loose = planFromFiles([{ path: 'Pong/main.lua', data: 'x' }], { mode: 'love-files', root: 'Pong/' }, { theme });
    expect(loose.args).toEqual(['./']);
    expect(loose.files.map((x) => x.path)).toEqual(['main.lua', 'theme.lua']);
    expect(themeLua(theme)).toBe('return { bg = {0.063, 0.063, 0.063}, ink = {1.000, 1.000, 1.000}, soft = {0.600, 0.600, 0.600}, faint = {0.267, 0.267, 0.267}, accent = {0.200, 0.400, 1.000} }\n');
  });

  test('a lone Three.js module runs in a page with the shipped import map', () => {
    const plan = planFromFiles([{ path: 'scene.js', data: "import * as THREE from 'three';" }], { mode: 'scene' }, { origin: 'http://localhost:5173' });
    expect(plan.entry).toBe('index.html');
    expect(plan.importMap.imports.three).toBe('http://localhost:5173/playground/vendor/three/three.module.js');
    expect(plan.files.find((x) => x.path === 'index.html').text).toContain(token('scene.js'));
  });

  test('a page with its own import map keeps it', () => {
    const page = '<script type="importmap">{"imports":{"three":"https://cdn/three.js"}}</script>';
    expect(planFromFiles([{ path: 'index.html', data: page }], { mode: 'web', root: '', entry: 'index.html' }).importMap).toBeNull();
    expect(planFromFiles([{ path: 'index.html', data: '<p>' }], { mode: 'web', root: '', entry: 'index.html' }).importMap).toEqual(threeImportMap(''));
  });

  test('every bundled sample is on disk and plans cleanly', async () => {
    for (const sample of SAMPLES) {
      const plan = await planFromSample(sample, { fetchText: async (url) => fs.readFileSync(path.join(ROOT, 'public', url), 'utf8') });
      expect(['love', 'web']).toContain(plan.kind);
    }
    const marble = await planFromSample(SAMPLES.find((s) => s.id === 'three-marble'), { fetchText: async (url) => fs.readFileSync(path.join(ROOT, 'public', url), 'utf8') });
    expect(marble.files.find((x) => x.path === 'index.html').text).toContain(token('main.js'));
  });
});

describe('the playground route', () => {
  test('runner and runtimes ship where the window looks for them', () => {
    for (const file of ['runner.html', 'runner.js', 'vendor/love/love.js', 'vendor/love/love.wasm', 'vendor/love/LICENSE.md']) {
      expect(fs.existsSync(path.join(ROOT, 'public/playground', file))).toBe(true);
    }
    expect(fs.readFileSync(path.join(ROOT, 'public/playground/runner.html'), 'utf8')).toContain('src="runner.js"');
  });

  test('headers apply under /playground/ only', () => {
    const set = (url) => {
      const headers = {};
      let called = false;
      playgroundHeaders({ url }, { setHeader: (k, v) => { headers[k] = v; } }, () => { called = true; });
      return { headers, called };
    };
    const inside = set(`${PLAYGROUND_PREFIX}runner.html`);
    expect(inside.called).toBe(true);
    expect(inside.headers).toMatchObject({ 'Access-Control-Allow-Origin': '*', 'Cross-Origin-Embedder-Policy': 'credentialless', 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Resource-Policy': 'cross-origin' });
    expect(set('/api/chat').headers).toEqual({});
  });

  test('Three.js is served from node_modules without escaping it', () => {
    expect(resolveThreeVendor(ROOT, '/playground/vendor/three/three.module.js')).toMatch(/node_modules[\\/]three[\\/]build[\\/]three\.module\.js$/);
    expect(resolveThreeVendor(ROOT, '/playground/vendor/three/addons/controls/OrbitControls.js')).toMatch(/examples[\\/]jsm[\\/]controls[\\/]OrbitControls\.js$/);
    expect(resolveThreeVendor(ROOT, '/playground/vendor/three/../../package.json')).toBeNull();
    expect(resolveThreeVendor(ROOT, '/playground/vendor/three/addons/..%2F..%2F..%2Fpackage.json')).toBeNull();
    expect(resolveThreeVendor(ROOT, '/playground/vendor/three/nope.js')).toBeNull();
    expect(resolveThreeVendor(ROOT, '/src/main.jsx')).toBeNull();
  });

  test('the Add palette lists it under Games', () => {
    const manifests = FACTORY_WINDOWS.filter((m) => ['asteroids', 'gamePlayground'].includes(m.kind));
    const games = buildAddSections({ manifests }).find((s) => s.label === 'Games');
    expect(games.items.map((i) => i.cover)).toEqual(['asteroids', 'gamePlayground']);
    expect(hasGameCover('gamePlayground')).toBe(true);
  });
});
