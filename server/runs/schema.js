import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILENAMES = [
  '026-execution-ledger.sql',
  '030-run-causality.sql',
  '031-autonomous-run-causes.sql',
];
let schemaPromise = null;

export function ensureRunCausalitySchema(db = pool) {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    for (const filename of FILENAMES) {
      const sqlPath = path.resolve(__dirname, '..', '..', 'docker', filename);
      await db.query(await fs.promises.readFile(sqlPath, 'utf8'));
    }
  })();
  schemaPromise.catch(() => { schemaPromise = null; });
  return schemaPromise;
}
