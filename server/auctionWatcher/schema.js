import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SQL_PATH = path.resolve(here, '../../docker/072-auction-watcher.sql');

export async function ensureAuctionWatcherSchema(db) {
  await db.query(await fs.promises.readFile(SQL_PATH, 'utf8'));
}

export const __test__ = { SQL_PATH };
