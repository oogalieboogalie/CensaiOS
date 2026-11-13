import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SQL_PATH = path.resolve(here, '../../docker/049-share-links.sql');
const TRANSLATION_SQL = path.resolve(here, '../../docker/076-comment-translation.sql');

export async function ensureShareLinkSchema(db) {
  await db.query(await fs.promises.readFile(SQL_PATH, 'utf8'));
  await db.query(await fs.promises.readFile(TRANSLATION_SQL, 'utf8'));
}

export const __test__ = { SQL_PATH };
