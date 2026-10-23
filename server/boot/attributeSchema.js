import pool from '../db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';

const log = createLogger('db-setup');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function ensureAttributeSchema() {
  try {
    for (const filename of [
      '022-agent-attributes.sql',
      '023-attribute-registry.sql',
      '029-seed-mindsets.sql',
      '038-agent-equipment-tenancy.sql',
      '052-family-agent-rows.sql',
    ]) {
      const sqlPath = path.resolve(path.join(__dirname, '..', '..', 'docker', filename));
      const sql = await fs.promises.readFile(sqlPath, 'utf8');
      await pool.query(sql);
    }
  } catch (err) {
    log.error('agent attributes tables not set up', { code: safeErrorCode(err) });
    throw err;
  }
}
