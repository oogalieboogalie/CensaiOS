import pool from '../db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function ensureMultiUserSchema() {
  try {
    const sqlPath = path.resolve(path.join(__dirname, '..', '..', 'docker', '020-multi-user-auth.sql'));
    const sql = await fs.promises.readFile(sqlPath, 'utf8');
    await pool.query(sql);
  } catch (err) {
    console.error('Failed to run multi-user database schema migration:', err);
    throw err;
  }
}
