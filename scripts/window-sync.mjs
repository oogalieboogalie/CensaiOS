#!/usr/bin/env node
// WINDOW FACTORY SYNC
// -------------------
// Source of truth for a window's identity is its co-located `meta.js`
// (src/components/windows/<kind>/meta.js). This script derives the manifest
// entry and inserts it into src/lib/manifest/factoryWindows.js IF missing — so
// adding a window is: create one folder, run `npm run window:sync`. The
// registry needs no write: WINDOW_REGISTRY is derived from the manifest at
// runtime (windowRegistry.js is just a re-export; writing to it corrupts it).
//
//   node scripts/window-sync.mjs            # apply: insert any missing windows
//   node scripts/window-sync.mjs --check    # CI: exit 1 if any window is unsynced
//
// Existing (hand-authored) windows are never rewritten; discovery only ADDS new
// kinds, keeping blast radius at zero for everything already shipped.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deriveManifestEntry, normalizeWindowMeta } from '../src/lib/windowMeta.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const WINDOWS_DIR = path.join(repoRoot, 'src', 'components', 'windows');
// New windows are inserted into the factory data file, never the composer —
// the composer (windowManifest.js) and the hand-curated category files stay
// closed to mechanical writes, which keeps the size ratchet happy forever.
const FACTORY_FILE = path.join(repoRoot, 'src', 'lib', 'manifest', 'factoryWindows.js');
const SYNC_ANCHOR = '  // window:sync inserts new windows above this line — do not remove.';

const check = process.argv.includes('--check');

async function discoverMetas() {
  const metas = [];
  if (!fs.existsSync(WINDOWS_DIR)) return metas;
  for (const dir of fs.readdirSync(WINDOWS_DIR, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const metaPath = path.join(WINDOWS_DIR, dir.name, 'meta.js');
    if (!fs.existsSync(metaPath)) continue;
    const mod = await import(pathToFileURL(metaPath).href);
    if (!mod.windowMeta) continue;
    metas.push(normalizeWindowMeta({
      componentPath: `src/components/windows/${dir.name}/index.jsx`,
      ...mod.windowMeta,
    }));
  }
  return metas;
}

function q(s) { return `'${String(s).replace(/'/g, "\\'")}'`; }
function sizeLit(s) { return `{ w: ${s.w}, h: ${s.h} }`; }

function manifestEntrySource(meta) {
  const e = deriveManifestEntry(meta);
  const lines = [
    '  {',
    `    kind: ${q(e.kind)},`,
    `    canvasType: ${q(e.canvasType)},`,
    `    label: ${q(e.label)},`,
    `    componentName: ${q(e.componentName)},`,
    `    componentPath: ${q(e.componentPath)},`,
    `    defaultSize: ${sizeLit(e.defaultSize)},`,
  ];
  if (e.lab) lines.push(`    lab: ${JSON.stringify(e.lab)},`);
  if (e.moduleMenu) lines.push(`    moduleMenu: ${JSON.stringify(e.moduleMenu)},`);
  if (e.launcher) lines.push(`    launcher: ${JSON.stringify(e.launcher)},`);
  lines.push('  },');
  return lines.join('\n');
}

function insertBefore(text, anchor, block) {
  const idx = text.indexOf(anchor);
  if (idx === -1) throw new Error(`window-sync: anchor not found: ${anchor}`);
  return text.slice(0, idx) + block + '\n' + text.slice(idx);
}

async function main() {
  const metas = await discoverMetas();
  // Dedupe against the COMPOSED manifest (all category files), not just the
  // factory file, so hand-registered windows are never double-inserted.
  const { WINDOW_MANIFEST_BY_KIND } = await import(
    pathToFileURL(path.join(repoRoot, 'src', 'lib', 'windowManifest.js')).href
  );

  const pending = metas.filter((m) => !WINDOW_MANIFEST_BY_KIND[m.kind]);

  if (pending.length === 0) {
    console.log(`window-sync: up to date (${metas.length} folder window(s) discovered, all registered).`);
    return;
  }

  if (check) {
    console.error('window-sync: the following windows are unsynced. Run "npm run window:sync":');
    for (const m of pending) console.error(`  - ${m.kind} (${m.componentName})`);
    process.exit(1);
  }

  let nextManifest = fs.readFileSync(FACTORY_FILE, 'utf8').replace(/\r\n/g, '\n');
  for (const m of pending) {
    nextManifest = insertBefore(nextManifest, SYNC_ANCHOR, manifestEntrySource(m));
    console.log(`window-sync: + ${m.kind} (${m.componentName})`);
  }
  fs.writeFileSync(FACTORY_FILE, nextManifest);
  console.log(`window-sync: wrote ${pending.length} window(s) into manifest/factoryWindows.js (registry derives automatically).`);
}

main().catch((err) => { console.error(err); process.exit(1); });
