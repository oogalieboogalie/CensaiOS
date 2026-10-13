// Manifest v3 checks for `npm run window:validate` (frontier architecture
// part 3). Every module carries a v3 label: built-in windows (derived from the
// window manifest), sealed folder windows (their module.js) and the starter
// modules the generator learns from (server/modules/examples). v3 is a
// superset of the v2 window manifest, so the v2 checks in window-sdk.mjs
// still run first. Guide: docs/modules/manifest-v3.md

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isV3 } from '../src/lib/modules/manifestV3.js';
import { builtinManifest, validateV3 } from '../src/lib/modules/manifestV3Checks.js';
import { normalizeManifest } from '../src/lib/modules/moduleFormat.js';
import { parseExampleFile } from '../server/modules/examples.js';

export async function validateManifestsV3(repoRoot, windowManifests) {
  const errors = [];
  const seenIds = new Set();
  for (const item of windowManifests) {
    const label = builtinManifest(item);
    for (const problem of validateV3(label)) errors.push(`${item.kind}: manifest v3: ${problem}`);
    if (seenIds.has(label.id)) errors.push(`${item.kind}: manifest v3: duplicate id "${label.id}"`);
    seenIds.add(label.id);

    // A sealed folder window ships its module next to it (module.js).
    const folder = item.componentPath?.match(/^src\/components\/windows\/([^/]+)\/index\.jsx$/)?.[1];
    const modulePath = folder && path.join(repoRoot, 'src', 'components', 'windows', folder, 'module.js');
    if (item.sealedModule && !(modulePath && fs.existsSync(modulePath))) {
      errors.push(`${item.kind}: sealedModule is set but there is no module.js next to it`);
    }
    if (modulePath && fs.existsSync(modulePath)) {
      const mod = await import(pathToFileURL(modulePath).href);
      if (typeof mod.moduleSource !== 'string' || !mod.moduleSource.trim()) errors.push(`${item.kind}: module.js has no moduleSource`);
      for (const problem of validateV3(normalizeManifest(mod.moduleManifest))) errors.push(`${item.kind}: module.js manifest: ${problem}`);
    }
  }

  // Starter modules are written as v3 so the generator learns v3.
  const examplesDir = path.join(repoRoot, 'server', 'modules', 'examples');
  for (const name of fs.readdirSync(examplesDir).filter(n => n.endsWith('.html')).sort()) {
    const text = fs.readFileSync(path.join(examplesDir, name), 'utf8');
    const raw = JSON.parse(text.match(/^\s*<!--\s*module\s+([\s\S]*?)-->/)?.[1] || '{}').manifest;
    if (!isV3(raw)) errors.push(`examples/${name}: starter modules must use manifest v3 ("manifest": 3)`);
    const example = parseExampleFile(text, name);
    for (const problem of validateV3(example.manifest)) errors.push(`examples/${name}: ${problem}`);
    for (const tool of example.manifest.tools) {
      if (!new RegExp(`censai\\.tools\\.handle\\(\\s*['"]${tool.name}['"]`).test(example.source)) {
        errors.push(`examples/${name}: tool "${tool.name}" is declared but never handled`);
      }
    }
  }
  return { errors };
}
