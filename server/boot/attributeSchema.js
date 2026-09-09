import pool from '../db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function ensureAttributeSchema() {
  try {
    for (const filename of [
      '022-agent-attributes.sql',
      '023-attribute-registry.sql',
      '029-seed-mindsets.sql',
      '038-agent-equipment-tenancy.sql',
    ]) {
      const sqlPath = path.resolve(path.join(__dirname, '..', '..', 'docker', filename));
      const sql = await fs.promises.readFile(sqlPath, 'utf8');
      await pool.query(sql);
    }
  } catch (err) {
    console.error('Failed to run agent attributes database schema migration:', err);
    throw err;
  }
}
