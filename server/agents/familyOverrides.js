import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FAMILY_AGENT_BY_ID, FAMILY_AGENT_SYSTEMS } from '../../src/data/family-agents.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PATH = path.resolve(here, '../../config/family-agents.json');

let cache = null;

// Note: failures are silent by design (missing or invalid file = canonical
// defaults). Server code must never log per-request, and the jest setup
// fails suites on console noise.

// Operator override file for the canonical family agent system prompts.
// Point CENSAI_FAMILY_AGENTS_FILE at a JSON object of { "<agentId>": "<prompt>" }
// (see config/family-agents.example.json), or drop it at the default path.
// Missing file = canonical defaults stand. Unknown ids and empty prompts are
// ignored so typos fail safe instead of silently registering junk.
export function overrideFilePath() {
  return process.env.CENSAI_FAMILY_AGENTS_FILE || DEFAULT_PATH;
}

export function loadFamilyAgentOverrides() {
  if (cache) return cache;
  cache = {};
  let raw;
  try {
    raw = fs.readFileSync(overrideFilePath(), 'utf8');
  } catch {
    return cache;
  }
  try {
    const parsed = JSON.parse(raw);
    for (const [id, prompt] of Object.entries(parsed || {})) {
      if (id.startsWith('_')) continue;
      if (typeof prompt !== 'string' || !prompt.trim()) continue;
      if (!FAMILY_AGENT_BY_ID[id]) continue;
      cache[id] = prompt;
    }
  } catch {
    cache = {};
  }
  return cache;
}

export function getFamilyAgentSystem(agentId) {
  return loadFamilyAgentOverrides()[agentId] ?? FAMILY_AGENT_SYSTEMS[agentId] ?? null;
}

// Test-only: drop the cached overrides so suites can point at temp files.
export function __resetFamilyAgentOverrides() {
  cache = null;
}
