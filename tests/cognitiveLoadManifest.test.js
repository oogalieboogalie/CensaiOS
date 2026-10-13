// Cognitive-load manifest tests.
// Validates the schema, the 3 example packages, and the CLI smoke-test paths.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import Ajv from 'ajv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCHEMA_PATH = path.join(__dirname, '..', 'docs', 'schemas', 'cognitive-load.schema.json');
const EXAMPLES_DIR = path.join(__dirname, '..', 'docs', 'package-examples');
const CLI_PATH = path.join(__dirname, '..', 'scripts', 'packages', 'cognitive-load-validate.mjs');

function loadSchema() {
  const raw = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  const transformed = JSON.parse(JSON.stringify(raw));
  if (transformed.$defs) {
    transformed.definitions = transformed.$defs;
    delete transformed.$defs;
  }
  transformed.$schema = 'http://json-schema.org/draft-07/schema#';
  const rewriteRefs = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(rewriteRefs); return; }
    if (typeof node.$ref === 'string') {
      node.$ref = node.$ref.replace('#/$defs/', '#/definitions/');
    }
    for (const k of Object.keys(node)) rewriteRefs(node[k]);
  };
  rewriteRefs(transformed);
  return transformed;
}

function loadExample(name) {
  return JSON.parse(fs.readFileSync(path.join(EXAMPLES_DIR, name), 'utf8'));
}

// Extract just the cognitiveLoad block — the schema validates only that sub-object.
function extractCognitiveLoadBlock(pkg) {
  const block = {};
  if (pkg.cognitiveLoad) block.cognitiveLoad = pkg.cognitiveLoad;
  if (pkg.signals) block.signals = pkg.signals;
  if (pkg.rationale) block.rationale = pkg.rationale;
  if (pkg.lastReviewed) block.lastReviewed = pkg.lastReviewed;
  return block;
}

describe('Cognitive-load manifest field', () => {
  let validate;
  beforeAll(() => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    validate = ajv.compile(loadSchema());
  });

  test('pomodoro-timer.json validates (low)', () => {
    const ok = validate(extractCognitiveLoadBlock(loadExample('pomodoro-timer.json')));
    if (!ok) throw new Error('pomodoro-timer.json failed:\n' + JSON.stringify(validate.errors, null, 2));
    expect(ok).toBe(true);
  });

  test('homebase-orchestrator.json validates (high)', () => {
    const ok = validate(extractCognitiveLoadBlock(loadExample('homebase-orchestrator.json')));
    if (!ok) throw new Error('homebase-orchestrator.json failed:\n' + JSON.stringify(validate.errors, null, 2));
    expect(ok).toBe(true);
  });

  test('quick-capture.json validates (low)', () => {
    const ok = validate(extractCognitiveLoadBlock(loadExample('quick-capture.json')));
    if (!ok) throw new Error('quick-capture.json failed:\n' + JSON.stringify(validate.errors, null, 2));
    expect(ok).toBe(true);
  });

  test('negative: invalid enum value rejected', () => {
    const pkg = extractCognitiveLoadBlock(loadExample('pomodoro-timer.json'));
    pkg.cognitiveLoad = 'extreme';
    const ok = validate(pkg);
    expect(ok).toBe(false);
    expect((validate.errors || []).some((e) => e.keyword === 'enum')).toBe(true);
  });

  test('negative: signals.setupMinutes = -1 rejected (min 0)', () => {
    const pkg = extractCognitiveLoadBlock(loadExample('pomodoro-timer.json'));
    pkg.signals = { ...pkg.signals, setupMinutes: -1 };
    const ok = validate(pkg);
    expect(ok).toBe(false);
    expect((validate.errors || []).some((e) => e.keyword === 'minimum')).toBe(true);
  });

  test('negative: additionalProperties false rejects unknown signal keys', () => {
    const pkg = extractCognitiveLoadBlock(loadExample('pomodoro-timer.json'));
    pkg.signals = { ...pkg.signals, magicNumber: 42 };
    const ok = validate(pkg);
    expect(ok).toBe(false);
    expect((validate.errors || []).some((e) => e.keyword === 'additionalProperties')).toBe(true);
  });

  test('negative: notificationVolume must match N/hr pattern', () => {
    const pkg = extractCognitiveLoadBlock(loadExample('pomodoro-timer.json'));
    pkg.signals = { ...pkg.signals, notificationVolume: 'many' };
    const ok = validate(pkg);
    expect(ok).toBe(false);
    expect((validate.errors || []).some((e) => e.keyword === 'pattern')).toBe(true);
  });

  test('CLI smoke: pomodoro-timer.json exits 0 with verdict format', () => {
    const r = spawnSync('node', [CLI_PATH, path.join(EXAMPLES_DIR, 'pomodoro-timer.json')], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toMatch(/^OK: cognitiveLoad=low \(signals:.*\)$/);
  });

  test('CLI smoke: homebase-orchestrator.json exits 0 with verdict format', () => {
    const r = spawnSync('node', [CLI_PATH, path.join(EXAMPLES_DIR, 'homebase-orchestrator.json')], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toMatch(/^OK: cognitiveLoad=high \(signals:.*\)$/);
  });

  test('CLI smoke: malformed JSON file exits 2 (usage error)', () => {
    const tmp = path.join(__dirname, '..', 'tmp-bad-json.json');
    fs.writeFileSync(tmp, '{ not valid json');
    try {
      const r = spawnSync('node', [CLI_PATH, tmp], { encoding: 'utf8' });
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/not valid JSON/i);
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  test('CLI smoke: missing file exits 2 (usage error)', () => {
    const r = spawnSync('node', [CLI_PATH, '/no/such/file.json'], { encoding: 'utf8' });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/file not found/i);
  });

  test('CLI smoke: no arg exits 2 with usage message', () => {
    const r = spawnSync('node', [CLI_PATH], { encoding: 'utf8' });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/usage:/i);
  });

  test('contract shape: schema is valid JSON', () => {
    expect(() => JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'))).not.toThrow();
  });

  test('contract shape: every example is valid JSON', () => {
    for (const name of ['pomodoro-timer.json', 'homebase-orchestrator.json', 'quick-capture.json']) {
      expect(() => JSON.parse(fs.readFileSync(path.join(EXAMPLES_DIR, name), 'utf8'))).not.toThrow();
    }
  });
});
