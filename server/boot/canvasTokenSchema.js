import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function ensureCanvasIntegrationTokenSchema(db = pool) {
  const sqlPath = path.resolve(
    path.join(__dirname, '..', '..', 'docker', '045-canvas-integration-tokens.sql')
  );
  const sql = await fs.promises.readFile(sqlPath, 'utf8');
  await db.query(sql);
}
