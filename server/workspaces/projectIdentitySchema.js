// Applies docker/098-project-identity.sql at start on an install that was set
// up before it: two projects from different places may share a name.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SQL_PATH = path.resolve(here, '../../docker/098-project-identity.sql');

export async function ensureProjectIdentitySchema(db) {
  await db.query(await fs.promises.readFile(SQL_PATH, 'utf8'));
}

export const __test__ = { SQL_PATH };
