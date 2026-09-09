import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function ensureUserApiKeySchema() {
  const sqlPath = path.resolve(
    path.join(__dirname, '..', '..', 'docker', '023-user-api-keys.sql')
  );
  const sql = await fs.promises.readFile(sqlPath, 'utf8');
  await pool.query(sql);
}
