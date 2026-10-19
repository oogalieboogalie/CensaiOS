import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SQL_PATH = path.resolve(here, '../../docker/051-research-knowledge.sql');
const TAGS_SQL_PATH = path.resolve(here, '../../docker/066-knowledge-chunk-tags.sql');

export async function ensureResearchSchema(db) {
  await db.query(await fs.promises.readFile(SQL_PATH, 'utf8'));
  await db.query(await fs.promises.readFile(TAGS_SQL_PATH, 'utf8'));
}

export const __test__ = { SQL_PATH, TAGS_SQL_PATH };
