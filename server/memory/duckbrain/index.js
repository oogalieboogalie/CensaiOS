import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, 'duckbrain_query.py');
const DEFAULT_DB = process.env.HOMEBRAIN_PATH || 'C:\\homebase-db\\FAMILY_BRAIN_ALEX_NO_TOUCH.duckdb';
const PY = process.env.HOMEBRAIN_PYTHON || 'py';
const TIMEOUT_MS = Number(process.env.HOMEBRAIN_TIMEOUT_MS) || 15000;

// Read-only bridge into the family brain DuckDB. The python side opens
// read_only, allowlists agents/tables, and binds the query as a parameter.
// Returns { ok, rows } — never throws; a dead brain degrades to Postgres-only.
export function queryBrain({ agent, action, query = '', limit = 12, db = DEFAULT_DB } = {}) {
  return new Promise((resolve) => {
    const child = execFile(
      PY,
      [SCRIPT, '--db', db, '--agent', String(agent || ''), '--action', String(action || ''),
       '--query', String(query || ''), '--limit', String(limit)],
      { timeout: TIMEOUT_MS, windowsHide: true },
      (error, stdout) => {
        if (error) {
          resolve({ ok: false, error: String(error.message || error).slice(0, 160), rows: [] });
          return;
        }
        try {
          const parsed = JSON.parse(String(stdout || '[]'));
          if (parsed && parsed.error) {
            resolve({ ok: false, error: String(parsed.error).slice(0, 160), rows: [] });
            return;
          }
          resolve({ ok: true, rows: Array.isArray(parsed) ? parsed : [] });
        } catch {
          resolve({ ok: false, error: 'brain returned non-JSON', rows: [] });
        }
      },
    );
    child.on('error', (err) => {
      resolve({ ok: false, error: String(err.message || err).slice(0, 160), rows: [] });
    });
  });
}
