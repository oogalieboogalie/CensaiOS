import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SQL_PATH = path.resolve(here, '../../docker/060-board-workflows.sql');
// Hash of the graph at the moment auto start was turned on (077).
const HASH_SQL_PATH = path.resolve(here, '../../docker/077-workflow-trigger-graph.sql');

export async function ensureBoardWorkflowSchema(db) {
  await db.query(await fs.promises.readFile(SQL_PATH, 'utf8'));
  await db.query(await fs.promises.readFile(HASH_SQL_PATH, 'utf8'));
}

export const __test__ = { SQL_PATH, HASH_SQL_PATH };
