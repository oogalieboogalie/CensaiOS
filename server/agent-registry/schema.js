import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db.js';
import { createLogger } from '../logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const log = createLogger('agent-registry-schema');

const SQL_PATH = path.resolve(
  path.join(__dirname, '..', '..', 'docker', '025-agent-cards.sql')
);

/**
 * Idempotently apply the agent_cards migration. The SQL is wrapped in
 * BEGIN/COMMIT so the whole migration is atomic. The CREATE TABLE
 * / CREATE INDEX / INSERT statements all use IF NOT EXISTS or
 * ON CONFLICT DO NOTHING, so re-running on a populated database is a
 * no-op (other than the transaction boundary overhead).
 */
export async function ensureAgentCardSchema() {
  const sql = await fs.promises.readFile(SQL_PATH, 'utf8');
  await pool.query(sql);
  log.info('agent_cards schema applied', { path: SQL_PATH });
}

export const __test__ = { SQL_PATH };
