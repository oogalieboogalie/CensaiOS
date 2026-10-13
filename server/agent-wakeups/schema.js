import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function ensureAgentWakeupSchema() {
  const sqlPath = path.resolve(__dirname, '..', '..', 'docker', '024-agent-wakeups.sql');
  await pool.query(await fs.promises.readFile(sqlPath, 'utf8'));
}
