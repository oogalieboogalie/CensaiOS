// Censai Agent Card contract tests.
// Validates all 3 example cards + negative cases against docs/schemas/agent-card.schema.json.
//
// Uses ajv 6.15.0 (already in node_modules — no new npm deps). Ajv 6 expects draft-07-style
// `definitions`, while our published schema uses draft-2020-12 `$defs` — we transform at load
// time so the schema file stays modern-standard but the test is happy.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCHEMA_PATH = path.join(__dirname, '..', 'docs', 'schemas', 'agent-card.schema.json');
const CARDS_DIR = path.join(__dirname, '..', 'docs', 'agent-cards');

function loadSchema() {
  const raw = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  // Transform $defs -> definitions for ajv 6 compatibility. The published schema file is
  // untouched; only this in-memory copy is rewritten for the validator. We also rewrite
  // $schema to draft-07 because ajv 6.15 doesn't know draft-2020-12.
  const transformed = JSON.parse(JSON.stringify(raw));
  if (transformed.$defs) {
    transformed.definitions = transformed.$defs;
    delete transformed.$defs;
  }
  transformed.$schema = 'http://json-schema.org/draft-07/schema#';
  // Rewrite every "$ref": "#/$defs/..." -> "#/definitions/..." recursively.
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

function loadCard(name) {
  return JSON.parse(fs.readFileSync(path.join(CARDS_DIR, name), 'utf8'));
}

describe('Censai Agent Card contract', () => {
  let validate;
  beforeAll(() => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    validate = ajv.compile(loadSchema());
  });

  test('genesis.json validates against the contract schema', () => {
    const card = loadCard('genesis.json');
    const ok = validate(card);
    if (!ok) {
      throw new Error('genesis.json failed schema validation:\n' + JSON.stringify(validate.errors, null, 2));
    }
    expect(ok).toBe(true);
  });

  test('imported-claude.json validates against the contract schema', () => {
    const card = loadCard('imported-claude.json');
    const ok = validate(card);
    if (!ok) {
      throw new Error('imported-claude.json failed schema validation:\n' + JSON.stringify(validate.errors, null, 2));
    }
    expect(ok).toBe(true);
  });

  test('marketplace-publisher.json validates against the contract schema', () => {
    const card = loadCard('marketplace-publisher.json');
    const ok = validate(card);
    if (!ok) {
      throw new Error('marketplace-publisher.json failed schema validation:\n' + JSON.stringify(validate.errors, null, 2));
    }
    expect(ok).toBe(true);
  });

  test('negative: missing required id fails with a clear error', () => {
    const card = loadCard('genesis.json');
    delete card.id;
    const ok = validate(card);
    expect(ok).toBe(false);
    // ajv 6 uses `dataPath`; ajv 8 uses `instancePath`. Check both.
    const idError = (validate.errors || []).find((e) =>
      (e.instancePath === '' || e.dataPath === '')
      && e.params && e.params.missingProperty === 'id'
    );
    expect(idError).toBeDefined();
  });

  test('negative: additionalProperties false rejects unknown root fields', () => {
    const card = loadCard('genesis.json');
    card.magic = 'shoelace';
    const ok = validate(card);
    expect(ok).toBe(false);
    const magicError = (validate.errors || []).find((e) => e.params && e.params.additionalProperty === 'magic');
    expect(magicError).toBeDefined();
  });

  test('negative: capability mode enum rejects invalid mode', () => {
    const card = loadCard('genesis.json');
    card.capabilities[0].mode = 'always';
    const ok = validate(card);
    expect(ok).toBe(false);
    expect((validate.errors || []).some((e) => e.keyword === 'enum')).toBe(true);
  });

  test('negative: id pattern rejects malformed id', () => {
    const card = loadCard('genesis.json');
    card.id = 'not-an-agent-id';
    const ok = validate(card);
    expect(ok).toBe(false);
    expect((validate.errors || []).some((e) => e.keyword === 'pattern')).toBe(true);
  });

  test('round-trip: parse -> serialize -> re-parse preserves equivalence', () => {
    for (const name of ['genesis.json', 'imported-claude.json', 'marketplace-publisher.json']) {
      const original = loadCard(name);
      const roundTripped = JSON.parse(JSON.stringify(original));
      const ok1 = validate(original);
      const ok2 = validate(roundTripped);
      expect(ok1).toBe(true);
      expect(ok2).toBe(true);
      expect(roundTripped).toEqual(original);
    }
  });

  test('a minimal Censai manifest validates without optional runtime posture', () => {
    const minimal = {
      $schema: 'https://censai.dev/schemas/agent-card.schema.json',
      id: 'agent:a2a-minimal',
      name: 'Censai Minimal',
      description: 'A card with only required Censai manifest fields.',
      version: '0.0.1',
      capabilities: [{ name: 'memory.read', mode: 'read' }],
      skills: [{ id: 'skill:ping', name: 'Ping', description: 'Returns pong.' }]
    };
    const ok = validate(minimal);
    if (!ok) {
      throw new Error('Minimal Censai card failed schema validation:\n' + JSON.stringify(validate.errors, null, 2));
    }
    expect(ok).toBe(true);
  });

  test('contract shape: schema file is valid JSON', () => {
    const raw = fs.readFileSync(SCHEMA_PATH, 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  test('contract shape: every example card is valid JSON', () => {
    for (const name of ['genesis.json', 'imported-claude.json', 'marketplace-publisher.json']) {
      const raw = fs.readFileSync(path.join(CARDS_DIR, name), 'utf8');
      expect(() => JSON.parse(raw)).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// D1 — agent_cards DB schema migration
// Brief: .team/handoffs/2026-06-23-d1-agent-card-schema.md
//
// The first describe block above tests the JSON contract
// (docs/schemas/agent-card.schema.json + docs/agent-cards/*.json) which
// shipped in commit 216a939. This second block tests the DB-level migration
// (docker/025-agent-cards.sql) + schema bootstrap. Both live in the same
// file because the brief's filename spec is `agentCardSchema.test.js` and
// the do-not-touch rule forbids deleting or weakening tests — appending is
// the additive, non-destructive path.
// ---------------------------------------------------------------------------

describe('agent_cards DB migration (docker/025-agent-cards.sql)', () => {
  const MIGRATION_PATH = path.join(__dirname, '..', 'docker', '025-agent-cards.sql');

  test('migration file exists and is non-empty', () => {
    expect(fs.existsSync(MIGRATION_PATH)).toBe(true);
    const raw = fs.readFileSync(MIGRATION_PATH, 'utf8');
    expect(raw.trim().length).toBeGreaterThan(0);
  });

  test('migration creates the agent_cards table with portable registry columns', () => {
    const raw = fs.readFileSync(MIGRATION_PATH, 'utf8');
    expect(raw).toMatch(/CREATE TABLE IF NOT EXISTS agent_cards/i);
    for (const col of [
      'id', 'name', 'description', 'version', 'skills',
      'endpoint', 'auth', 'owner_id', 'workspace_id',
      'visibility', 'metadata', 'created_at', 'updated_at', 'deleted_at',
    ]) {
      expect(raw).toMatch(new RegExp(`\\b${col}\\b`, 'i'));
    }
  });

  test('migration creates the three required indexes', () => {
    const raw = fs.readFileSync(MIGRATION_PATH, 'utf8');
    expect(raw).toMatch(/CREATE INDEX IF NOT EXISTS agent_cards_owner_idx/i);
    expect(raw).toMatch(/CREATE INDEX IF NOT EXISTS agent_cards_workspace_idx/i);
    expect(raw).toMatch(/CREATE INDEX IF NOT EXISTS agent_cards_visibility_idx/i);
  });

  test('migration seeds all 7 family agents as public system cards', () => {
    const raw = fs.readFileSync(MIGRATION_PATH, 'utf8');
    expect(raw).toMatch(/ON CONFLICT \(id\) DO NOTHING/i);
    for (const id of [
      'agent:architect', 'agent:censai', 'agent:atlas', 'agent:genesis',
      'agent:nexus', 'agent:foundation', 'agent:echo',
    ]) {
      expect(raw).toContain(id);
    }
  });

  test('migration is wrapped in a single transaction (BEGIN; ... COMMIT;)', () => {
    const raw = fs.readFileSync(MIGRATION_PATH, 'utf8');
    expect(raw).toMatch(/^\s*BEGIN\s*;/m);
    expect(raw).toMatch(/^\s*COMMIT\s*;?\s*$/m);
  });

  test('schema.js exposes ensureAgentCardSchema and points at the right SQL', async () => {
    const { ensureAgentCardSchema, __test__ } = await import('../server/agent-registry/schema.js');
    expect(typeof ensureAgentCardSchema).toBe('function');
    expect(__test__.SQL_PATH).toMatch(/docker[\\/]025-agent-cards\.sql$/);
    // Touch the function so eslint doesn't flag the unused import.
    expect(ensureAgentCardSchema.name).toBe('ensureAgentCardSchema');
  });
});
