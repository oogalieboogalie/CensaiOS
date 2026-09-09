#!/usr/bin/env node
// cognitive-load-validate.mjs — validate a package's cognitiveLoad metadata against
// docs/schemas/cognitive-load.schema.json.
//
// Usage:
//   node scripts/packages/cognitive-load-validate.mjs <path-to-package.json>
//
// Exit codes:
//   0 — valid (cognitiveLoad present and schema-valid)
//   1 — invalid (schema validation failed; stderr has detail)
//   2 — usage error (file missing, not JSON, no arg)
//
// Pure stdlib (fs, path) + the same ajv-from-node_modules pattern used in
// tests/agentCardSchema.test.js. No new npm deps.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCHEMA_PATH = path.join(__dirname, '..', '..', 'docs', 'schemas', 'cognitive-load.schema.json');

function loadSchema() {
  const raw = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  // ajv 6.15 expects draft-07 `$schema` and `definitions`, not draft-2020-12 `$defs`.
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

function main() {
  const arg = process.argv[2];
  if (!arg) {
    process.stderr.write('usage: cognitive-load-validate.mjs <path-to-package.json>\n');
    process.exit(2);
  }
  const filePath = path.resolve(arg);
  if (!fs.existsSync(filePath)) {
    process.stderr.write(`error: file not found: ${filePath}\n`);
    process.exit(2);
  }
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    process.stderr.write(`error: not valid JSON: ${err.message}\n`);
    process.exit(2);
  }
  if (!pkg.cognitiveLoad) {
    process.stderr.write(`error: package has no cognitiveLoad field (skip is allowed by the contract, but then this validator isn't applicable)\n`);
    process.exit(1);
  }
  // Extract just the cognitiveLoad block from the package. The cognitiveLoad schema
  // validates only the field itself + signals + rationale + lastReviewed — not the
  // whole package manifest (which has its own schema owned by the future package
  // manifest contract).
  const cognitiveLoadObject = {};
  if (pkg.cognitiveLoad) cognitiveLoadObject.cognitiveLoad = pkg.cognitiveLoad;
  if (pkg.signals) cognitiveLoadObject.signals = pkg.signals;
  if (pkg.rationale) cognitiveLoadObject.rationale = pkg.rationale;
  if (pkg.lastReviewed) cognitiveLoadObject.lastReviewed = pkg.lastReviewed;
  const validate = new Ajv({ allErrors: true, strict: false }).compile(loadSchema());
  const ok = validate(cognitiveLoadObject);
  if (!ok) {
    process.stderr.write(`error: cognitiveLoad schema validation failed:\n${JSON.stringify(validate.errors, null, 2)}\n`);
    process.exit(1);
  }
  const signals = pkg.signals
    ? `signals: ${Object.entries(pkg.signals).map(([k, v]) => `${k}=${v}`).join(', ')}`
    : 'no signals';
  process.stdout.write(`OK: cognitiveLoad=${pkg.cognitiveLoad} (${signals})\n`);
  process.exit(0);
}

main();
