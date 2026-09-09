import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SQL_PATH = path.resolve(here, '../../docker/041-agent-card-installs.sql');

export async function ensureAgentCardInstallSchema(db) {
  await db.query(await fs.promises.readFile(SQL_PATH, 'utf8'));
}

export async function readAgentCardInstallSchema(db) {
  const [tables, indexes] = await Promise.all([
    db.query(`SELECT column_name,data_type,is_nullable FROM information_schema.columns
      WHERE table_schema='public' AND table_name='workspace_agent_card_installs'
      ORDER BY ordinal_position`),
    db.query(`SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public'
      AND tablename='workspace_agent_card_installs' ORDER BY indexname`),
  ]);
  return { columns: tables.rows, indexes: indexes.rows };
}

export const __test__ = { SQL_PATH };
