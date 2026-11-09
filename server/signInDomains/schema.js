import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listSignInDomains } from './store.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SQL_PATH = path.resolve(here, '../../docker/094-sign-in-domains.sql');

/** Start-up: make the table, then load the domains the sign-in checks use. */
export async function ensureSignInDomainSchema(db) {
  await db.query(await fs.promises.readFile(SQL_PATH, 'utf8'));
  await listSignInDomains(db);
}

export const __test__ = { SQL_PATH };
