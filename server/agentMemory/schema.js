import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SQL_PATH = path.resolve(here, '../../docker/056-agent-memory.sql');
const GRAPH_SQL_PATH = path.resolve(here, '../../docker/063-agent-graph.sql');
const SHELVES_SQL_PATH = path.resolve(here, '../../docker/065-agent-memory-shelves.sql');
const TURNS_SQL_PATH = path.resolve(here, '../../docker/068-agent-turns.sql');

export async function ensureAgentMemorySchema(db) {
  await db.query(await fs.promises.readFile(SQL_PATH, 'utf8'));
  await db.query(await fs.promises.readFile(GRAPH_SQL_PATH, 'utf8'));
  await db.query(await fs.promises.readFile(SHELVES_SQL_PATH, 'utf8'));
  await db.query(await fs.promises.readFile(TURNS_SQL_PATH, 'utf8'));
}

export const __test__ = { SQL_PATH, GRAPH_SQL_PATH, SHELVES_SQL_PATH, TURNS_SQL_PATH };
