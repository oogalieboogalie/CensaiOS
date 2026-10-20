import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SQL_PATH = path.resolve(here, '../../docker/044-sales-leads.sql');
// Saved drafts (sequence + ice breaker) on each lead, added after 044.
const DRAFTS_SQL_PATH = path.resolve(here, '../../docker/074-sales-lead-drafts.sql');

export async function ensureSalesLeadSchema(db) {
  await db.query(await fs.promises.readFile(SQL_PATH, 'utf8'));
  await db.query(await fs.promises.readFile(DRAFTS_SQL_PATH, 'utf8'));
}

export const __test__ = { SQL_PATH, DRAFTS_SQL_PATH };
