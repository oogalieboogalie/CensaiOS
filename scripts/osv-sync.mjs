#!/usr/bin/env node
// Sync the local OSV vulnerability mirror now.
// Usage: npm run osv:sync -- [ecosystem ...] [--full]
import 'dotenv/config';
import pool from '../server/db.js';
import { runOsvMirrorSync, mirrorConfig } from '../server/osvMirror/worker.js';

const args = process.argv.slice(2);
const forceFull = args.includes('--full');
const named = args.filter((a) => !a.startsWith('--'));
const ecosystems = named.length ? named : mirrorConfig().ecosystems;

try {
  const result = await runOsvMirrorSync({ ecosystems, forceFull });
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.results?.some((r) => r.error) ? 1 : 0;
} finally {
  await pool.end();
}
