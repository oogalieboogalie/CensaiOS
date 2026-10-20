import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';
import { authoringManifest, cleanHost, cspHosts, describePermissions, findTool, moduleIdFromName } from '../src/lib/modules/manifestV3.js';
import { builtinManifest, checkToolInput, validateV3 } from '../src/lib/modules/manifestV3Checks.js';
import { normalizeManifest } from '../src/lib/modules/moduleFormat.js';
import { buildModuleDocument, moduleCsp } from '../src/lib/modules/moduleDocument.js';
import { pendingPermissions } from '../src/lib/modules/moduleGrants.js';
import { moduleCard } from '../src/lib/marketplace/moduleCard.js';
import { WINDOW_MANIFESTS } from '../src/lib/windowManifest.js';
import { loadModuleExamples, readModuleDir } from '../server/modules/examples.js';
import { runModuleChecks } from '../server/marketplace/moduleChecks.js';
import { checkModule } from '../server/modules/generator.js';
import { parseModuleReply } from '../src/lib/modules/moduleFormat.js';
import { moduleManifest as helloManifest, moduleSource as helloSource } from '../src/components/windows/helloFactory/module.js';

const here = path.dirname(fileURLToPath(import.meta.url));

describe('manifest v3', () => {
  test('a v3 manifest keeps exactly what it declares', () => {
    const m = normalizeManifest({
      manifest: 3, id: 'Weather Board', name: 'Weather', version: '2.1', author: 'Alma', icon: 'Activity',
      size: { w: 500, h: 400 }, permissions: ['network', 'agent', 'files'], network: ['https://api.open-meteo.com/v1/forecast', 'bad host'],
      tools: [
        { name: 'Show City', description: 'Show the weather for a city.', input: { city: 'string', days: { type: 'integer' } } },
        { name: '9bad', description: 'dropped' },
      ],
      state: { city: 'the city shown' },
    });
    expect(m).toMatchObject({
      manifest: 3, id: 'weather-board', name: 'Weather', version: '2.1.0', author: 'Alma', runs: 'sealed',
      permissions: ['agent', 'network'], network: ['api.open-meteo.com'], window: { size: { w: 500, h: 400 } }, state: { city: 'the city shown' },
    });
    expect(m.tools).toEqual([{ name: 'show_city', description: 'Show the weather for a city.', input: { type: 'object', properties: { city: { type: 'string' }, days: { type: 'integer' } } } }]);
    // A v3 module asked for no storage, so it gets none.
    expect(m.permissions).not.toContain('storage');
    expect(validateV3(m)).toEqual([]);
  });

  test('a v1 manifest upgrades without losing anything', () => {
    const m = normalizeManifest({ name: 'Old timer', permissions: ['network'] });
    expect(m).toMatchObject({ manifest: 3, id: 'old-timer', version: '1.0.0', permissions: ['storage', 'presence', 'network'], network: ['*'] });
    expect(cspHosts(m)).toEqual(['https:']);
    expect(describePermissions(m)).toEqual(['Save its data on the board', 'See who is on the board', 'Use any website']);
  });

  test('hosts, ids and inputs are cleaned', () => {
    expect(cleanHost('HTTPS://API.Example.com/path?q=1')).toBe('api.example.com');
    expect(cleanHost('*.example.com')).toBe('*.example.com');
    expect(cleanHost('localhost')).toBeNull();
    expect(cleanHost('javascript:alert(1)')).toBeNull();
    expect(moduleIdFromName('Tip Calculator!')).toBe('tip-calculator');
    const tool = { name: 'add', input: { type: 'object', properties: { price: { type: 'number' }, stage: { type: 'string', enum: ['Lead', 'Closed'] } }, required: ['stage'] } };
    expect(checkToolInput(tool, { price: '450000', stage: 'Lead', extra: 1 })).toEqual({ ok: true, input: { price: 450000, stage: 'Lead' } });
    expect(checkToolInput(tool, { price: 1 })).toMatchObject({ ok: false, error: '"stage" is required.' });
    expect(checkToolInput(tool, { stage: 'Sold' }).error).toMatch(/one of: Lead, Closed/);
    expect(checkToolInput(tool, { stage: 'Lead', price: 'lots' }).error).toMatch(/should be a number/);
  });

  test('only declared, granted sites get through the sandbox CSP', () => {
    const m = normalizeManifest({ manifest: 3, name: 'W', permissions: ['network'], network: ['api.open-meteo.com'] });
    expect(moduleCsp({ network: cspHosts(m) })).toMatch(/connect-src https:\/\/api\.open-meteo\.com;/);
    expect(moduleCsp({ network: false })).toMatch(/connect-src 'none'/);
    expect(moduleCsp({ network: ["https://ok.example.com", "'unsafe-eval'", 'http://x.test'] })).toMatch(/connect-src https:\/\/ok\.example\.com;/);
    // Storage and presence never prompt; agents and the internet ask each person.
    expect(pendingPermissions(normalizeManifest({ name: 'x', permissions: ['agent'] }), {})).toEqual(['agent']);
  });

  test('every built-in window has a valid v3 label, and Hello Factory runs sealed', () => {
    for (const item of WINDOW_MANIFESTS) expect([item.kind, validateV3(builtinManifest(item))]).toEqual([item.kind, []]);
    const hello = builtinManifest(WINDOW_MANIFESTS.find(m => m.kind === 'helloFactory'));
    expect(hello.runs).toBe('sealed');
    expect(builtinManifest(WINDOW_MANIFESTS.find(m => m.kind === 'terminal')).runs).toBe('app');
    expect(validateV3(normalizeManifest(helloManifest))).toEqual([]);
  });

  test('cards for modules listed before v3 keep their fingerprint shape', () => {
    const v1 = moduleCard({ manifest: { name: 'Tip', permissions: ['agent'] }, source: '<p>x</p>' });
    expect(v1.permissions).toEqual(['agent']);
    expect(v1).not.toHaveProperty('tools');
    const v3 = moduleCard({ manifest: { manifest: 3, name: 'Tip', permissions: ['storage'], tools: [{ name: 'split', description: 'd' }] }, source: '<p>x</p>' });
    expect(v3).toMatchObject({ manifest: 3, permissions: ['storage'], tools: [{ name: 'split' }] });
  });

  test('the generator and the marketplace hold modules to their manifest', () => {
    const reply = (m, html) => `\`\`\`json\n${JSON.stringify(m)}\n\`\`\`\n\n\`\`\`html\n${html}\n\`\`\``;
    expect(checkModule(parseModuleReply(reply({ manifest: 3, name: 'X', tools: [{ name: 'go', description: 'd' }] }, '<div></div>')))).toMatch(/never handles: go/);
    expect(checkModule(parseModuleReply(reply({ manifest: 3, name: 'X' }, '<script>censai.storage.set("a", 1)</script>')))).toMatch(/"storage"/);
    const checks = runModuleChecks({ manifest: { manifest: 3, name: 'X', description: 'Saves without asking first.' }, source: '<script>censai.storage.set("a",1)</script>' });
    expect(checks.results.find(r => r.id === 'storage-declared')).toMatchObject({ passed: false, required: true });
    expect(checks.passed).toBe(false);
  });

  test('starter modules are written in v3 and teach it', async () => {
    for (const example of await loadModuleExamples()) {
      expect(example.manifest.manifest).toBe(3);
      expect(example.manifest.tools.length).toBeGreaterThan(0);
      expect(authoringManifest(example.manifest)).toMatchObject({ manifest: 3, id: example.id });
    }
  });
});

// The sandbox document with the SDK, and a fake host on the other side.
function runModule(source, { storage = {}, manifest = null } = {}) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (err) => { if (!/Not implemented/.test(err.message)) errors.push(err.message); });
  const sent = [];
  // Catch messages sent while the module's own script first runs, too.
  const dom = new JSDOM(buildModuleDocument(source, { tokens: {}, storage, manifest }), {
    runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole,
    beforeParse(window) { window.parent.postMessage = (msg) => sent.push(msg); },
  });
  return { window: dom.window, document: dom.window.document, errors, sent };
}

function pressTool(win, callId, name, input) {
  win.dispatchEvent(new win.MessageEvent('message', { data: { __hbHost: 1, type: 'tool', callId, name, input }, source: win.parent }));
}

const flush = () => new Promise(resolve => setTimeout(resolve, 10));

describe('chat to module: tools inside the sandbox', () => {
  const examples = {};
  beforeAll(async () => {
    for (const e of await loadModuleExamples()) examples[e.id] = e;
  });

  test('an agent adds a listing and the board shows it', async () => {
    const mod = examples['listing-pipeline'];
    const { window, document, sent, errors } = runModule(mod.source, { manifest: mod.manifest });
    expect(window.censai.manifest).toMatchObject({ id: 'listing-pipeline', version: '1.0.0' });
    expect(sent.filter(m => m.method === 'tools.handled').map(m => m.args.name)).toEqual(['add_listing', 'move_listing', 'list_listings']);
    pressTool(window, 'c1', 'add_listing', { address: '12 Oak St', price: 525000, stage: 'Listed' });
    await flush();
    const result = sent.find(m => m.method === 'tool.result' && m.args.callId === 'c1');
    expect(result.args).toMatchObject({ ok: true, result: { address: '12 Oak St', price: 525000, stage: 'Listed' } });
    expect(document.getElementById('board').textContent).toContain('12 Oak St');
    expect(sent.some(m => m.method === 'storage.set' && m.args.key === 'listings')).toBe(true);

    pressTool(window, 'c2', 'move_listing', { address: 'nowhere', stage: 'Closed' });
    await flush();
    expect(sent.find(m => m.args?.callId === 'c2').args).toMatchObject({ ok: false, error: 'No listing matches nowhere' });
    pressTool(window, 'c3', 'not_a_tool', {});
    await flush();
    expect(sent.find(m => m.args?.callId === 'c3').args.error).toMatch(/no handler/);
    expect(errors).toEqual([]);
  });

  test.each([
    ['tip-calculator', 'split_bill', { bill: 120, tip_percent: 20, people: 3 }, { each: '$48.00' }],
    ['unit-converter', 'convert', { value: 1, from: 'mi', to: 'km' }, { result: 1.609344 }],
    ['flash-cards', 'add_card', { question: 'What is a lien?', answer: 'A legal claim on property.' }, { cards: 4 }],
    ['pomodoro-timer', 'pause_timer', {}, { mode: 'Focus' }],
  ])('%s answers %s', async (id, tool, input, expected) => {
    const mod = examples[id];
    const { window, sent } = runModule(mod.source, { manifest: mod.manifest });
    pressTool(window, 'x', tool, input);
    await flush();
    expect(sent.find(m => m.method === 'tool.result').args).toMatchObject({ ok: true, result: expected });
  });

  test('Hello Factory, moved into a sealed module, takes a new note from an agent', async () => {
    const { window, document, sent } = runModule(helloSource, { manifest: normalizeManifest(helloManifest) });
    expect(document.getElementById('version').textContent).toBe('v2.0.0');
    pressTool(window, 'h', 'set_note', { text: 'Atlas was here.' });
    await flush();
    expect(sent.find(m => m.method === 'tool.result').args).toMatchObject({ ok: true, result: { note: 'Atlas was here.' } });
    expect(document.getElementById('note').textContent).toBe('Atlas was here.');
  });

  test('a refused save rolls back what the module saw', async () => {
    const { window, sent } = runModule('<script>window.tried = censai.storage.set("k", 1).catch(e => e.message);</script>');
    expect(window.censai.storage.get('k')).toBe(1);
    const call = sent.find(m => m.method === 'storage.set');
    window.dispatchEvent(new window.MessageEvent('message', { data: { __hbHost: 1, id: call.id, error: 'This module did not ask to save data in its manifest.' }, source: window.parent }));
    expect(await window.tried).toMatch(/did not ask to save/);
    expect(window.censai.storage.get('k', 'none')).toBe('none');
  });

  test('older saved modules still run (fixtures written before v3)', async () => {
    for (const mod of await readModuleDir(path.join(here, 'fixtures/modules'))) {
      expect(mod.manifest.permissions).toEqual(expect.arrayContaining(['storage', 'presence']));
      expect(runModule(mod.source, { manifest: mod.manifest }).errors).toEqual([]);
    }
  });

  test('a lookup of a missing tool says so', () => {
    expect(findTool(examples['tip-calculator'].manifest, 'SPLIT_BILL')).toMatchObject({ name: 'split_bill' });
    expect(findTool(examples['tip-calculator'].manifest, 'nope')).toBeNull();
  });
});
