import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SQL_PATH = path.resolve(here, '../../docker/055-agent-network-receipts.sql');

export async function ensureAgentNetworkSchema(db) {
  await db.query(await fs.promises.readFile(SQL_PATH, 'utf8'));
}

export const __test__ = { SQL_PATH };
