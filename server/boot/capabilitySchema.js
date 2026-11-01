import pool from '../db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';

const log = createLogger('db-setup');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function ensureCapabilitySchema() {
  try {
    for (const filename of [
      '021-agent-capabilities.sql',
      '039-agent-capability-tenancy.sql',
      '040-agent-tool-approvals.sql',
      '042-workspace-tool-package-installs.sql',
    ]) {
      const sqlPath = path.resolve(path.join(__dirname, '..', '..', 'docker', filename));
      const sql = await fs.promises.readFile(sqlPath, 'utf8');
      await pool.query(sql);
    }
  } catch (err) {
    log.error('agent capabilities tables not set up', { code: safeErrorCode(err) });
    throw err;
  }
}
