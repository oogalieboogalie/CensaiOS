import { Router } from 'express';
import { readFileSync, existsSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');

export const coreRouter = Router();

const REGISTRY_PATH = path.join(REPO_ROOT, 'vex', 'data', 'registry', 'registry.json');
const RUNS_DIR = path.join(REPO_ROOT, 'vex', 'logs', 'runs');

// ─── Helpers ────────────────────────────────────────────────────────────────────

export function loadRegistry() {
  if (!existsSync(REGISTRY_PATH)) return { agents: [], blueprints: [], meta: {} };
  try {
    return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
  } catch {
    return { agents: [], blueprints: [], meta: {}, error: 'Failed to parse registry.json' };
  }
}

export function getRunDir(runId) {
  if (!/^run_\d+_[a-z0-9]+$/.test(runId)) return null;
  return path.join(RUNS_DIR, runId);
}

export function readRunFile(runDir, filename) {
  const p = path.join(runDir, filename);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

function listRecentRuns(limit = 20) {
  if (!existsSync(RUNS_DIR)) return [];
  try {
    return readdirSync(RUNS_DIR, { withFileTypes: true })
      .filter(e => e.isDirectory() && /^run_\d+_/.test(e.name))
      .sort((a, b) => b.name.localeCompare(a.name))
      .slice(0, limit)
      .map(e => {
        const runDir = path.join(RUNS_DIR, e.name);
        const meta = readRunFile(runDir, 'run_meta.json');
        return {
          run_id: e.name,
          started_at: meta?.started_at || null,
          completed_at: meta?.completed_at || null,
          task: meta?.task || null,
          agents_dispatched: meta?.agents_dispatched || null,
          agents_succeeded: meta?.agents_succeeded || null,
          status: meta?.completed_at ? 'complete' : 'running',
        };
      });
  } catch { return []; }
}

// ─── Routes ─────────────────────────────────────────────────────────────────────

coreRouter.get('/runs', (_req, res) => {
  res.json({ runs: listRecentRuns() });
});

coreRouter.get('/agents', (_req, res) => {
  const registry = loadRegistry();
  res.json({
    agents: registry.agents || [],
    count: (registry.agents || []).length,
    meta: registry.meta || {},
  });
});

coreRouter.get('/registry', (_req, res) => {
  res.json(loadRegistry());
});
