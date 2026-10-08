import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  appendVersion,
  MAX_MODULE_VERSIONS,
  normalizeManifest,
  parseModuleReply,
  titleFromRequest,
} from '../src/lib/modules/moduleFormat.js';
import { builtModulePatch, versionPatch } from '../src/lib/modules/moduleWindowState.js';
import { loadModuleExamples, readModuleDir } from '../server/modules/examples.js';
import { checkModule } from '../server/modules/generator.js';
import { buildGenerateMessages } from '../server/modules/prompt.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const reply = (manifest, html) => `\`\`\`json\n${JSON.stringify(manifest)}\n\`\`\`\n\n\`\`\`html\n${html}\n\`\`\``;

describe('module format', () => {
  test('parses the two-block reply into a manifest and source', () => {
    const parsed = parseModuleReply(reply({ name: 'Tip calculator', icon: 'Toolbox', permissions: ['agent'] }, '<div>hi</div>'));
    expect(parsed.complete).toBe(true);
    expect(parsed.source).toBe('<div>hi</div>');
    expect(parsed.manifest).toMatchObject({ name: 'Tip calculator', icon: 'Toolbox', permissions: ['agent'] });
  });

  test('a stream cut mid-HTML is not complete, but shows what arrived', () => {
    const parsed = parseModuleReply('```json\n{"name":"X"}\n```\n```html\n<div>partial', { request: 'x' });
    expect(parsed.complete).toBe(false);
    expect(parsed.source).toBe('<div>partial');
  });

  test('manifest is cleaned: unknown icons, permissions and sizes never pass through', () => {
    const m = normalizeManifest({ name: '  A\u0007  very\nlong name that keeps going and going beyond the limit ok ', icon: 'Rocket', permissions: ['agent', 'files', 'network', 'agent'], size: { w: 9999, h: 10 } });
    expect(m.icon).toBe('Toolbox');
    expect(m.permissions).toEqual(['agent', 'network']);
    expect(m.size).toEqual({ w: 1200, h: 220 });
    expect(m.name.length).toBeLessThanOrEqual(48);
    expect(m.name).not.toMatch(/[\u0000-\u001f]/); // eslint-disable-line no-control-regex
  });

  test('a missing manifest falls back to a title from the request', () => {
    expect(titleFromRequest('make me a tip calculator for my crew')).toBe('Tip calculator');
    expect(parseModuleReply('```html\n<p>x</p>\n```', { request: 'a board that tracks my listings by stage' }).manifest.name).toBe('Board');
  });

  test('static checks send back blocked patterns', () => {
    expect(checkModule(parseModuleReply(reply({}, '<script src="https://x.test/a.js"></script>')))).toMatch(/External scripts/);
    expect(checkModule(parseModuleReply(reply({}, '<link rel="stylesheet" href="x.css">')))).toMatch(/stylesheets/);
    expect(checkModule(parseModuleReply('```html\n<div>')) ).toMatch(/closed/);
    expect(checkModule(parseModuleReply(reply({}, '<div>ok</div>')))).toBeNull();
  });

  test('versions keep the newest twenty and undo restores an earlier one', () => {
    let versions = [];
    for (let i = 0; i < MAX_MODULE_VERSIONS + 5; i += 1) versions = appendVersion(versions, { source: `v${i}`, manifest: { name: `N${i}` } });
    expect(versions).toHaveLength(MAX_MODULE_VERSIONS);
    expect(versions[0].source).toBe('v5');
    const patch = builtModulePatch({ request: 'r', manifest: { name: 'Next', size: { w: 500, h: 400 } }, source: 'new', versions });
    expect(patch.versionIndex).toBe(MAX_MODULE_VERSIONS - 1);
    expect(patch.status).toBe('ready');
    expect(patch.buildOwner).toBeNull();
    expect(versionPatch({ ...patch }, 0)).toMatchObject({ versionIndex: 0, source: 'v6' });
    expect(versionPatch(patch, 99)).toBeNull();
  });
});

describe('example modules and the ten test prompts', () => {
  test('the five examples load and are taught to the generator', async () => {
    const examples = await loadModuleExamples();
    expect(examples.map(e => e.id)).toEqual(['flash-cards', 'listing-pipeline', 'pomodoro-timer', 'tip-calculator', 'unit-converter']);
    const messages = await buildGenerateMessages({ request: 'a habit tracker' });
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toMatch(/censai\.storage\.get/);
    expect(messages.filter(m => m.role === 'assistant')).toHaveLength(5);
    expect(messages.at(-1).content).toBe('Request: a habit tracker');
  });

  test('all ten modules pass the static checks and use only theme colors', async () => {
    const all = [...await loadModuleExamples(), ...await readModuleDir(path.join(here, 'fixtures/modules'))];
    expect(all).toHaveLength(10);
    for (const mod of all) {
      const parsed = parseModuleReply(reply(mod.manifest, mod.source));
      expect({ id: mod.id, problem: checkModule(parsed) }).toEqual({ id: mod.id, problem: null });
      expect({ id: mod.id, hex: mod.source.match(/#[0-9a-f]{3,8}\b(?![\w-])/gi) }).toEqual({ id: mod.id, hex: null });
      expect(mod.source).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});
