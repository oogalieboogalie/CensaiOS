// Spec 7: the five modules a Real Estate Team board opens with. They are
// sealed modules with a manifest v3 label (docs/modules/manifest-v3.md):
// sandboxed HTML that saves to the board and names the tools an agent can
// press, written with the module generator's format and polished by hand. Each file opens with a header
// comment holding the request and manifest, the same format the module
// generator's examples use:
//
//   <!-- module {"request": "...", "manifest": {...}} -->

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeManifest } from '../../../src/lib/modules/moduleFormat.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REAL_ESTATE_MODULES_DIR = path.join(here, 'modules');

export const REAL_ESTATE_MODULE_IDS = Object.freeze([
  'deal-pipeline', 'showing-schedule', 'open-house-sign-in', 'commission-calculator', 'cma-sheet',
]);

const HEADER = /^\s*<!--\s*module\s+([\s\S]*?)-->\s*/;

export function parseModuleFile(text, id) {
  const match = String(text).match(HEADER);
  if (!match) throw new Error(`Template module ${id} is missing its header comment.`);
  const meta = JSON.parse(match[1]);
  return {
    id,
    request: String(meta.request || ''),
    manifest: normalizeManifest(meta.manifest, { request: meta.request }),
    source: String(text).slice(match[0].length).trim(),
  };
}

let cached = null;

/** { [id]: { id, request, manifest, source } } for the five modules. */
export function loadRealEstateModules() {
  if (!cached) {
    cached = Promise.all(REAL_ESTATE_MODULE_IDS.map(async (id) => (
      parseModuleFile(await fs.promises.readFile(path.join(REAL_ESTATE_MODULES_DIR, `${id}.html`), 'utf8'), id)
    )))
      .then(list => Object.fromEntries(list.map(mod => [mod.id, mod])))
      .catch((error) => { cached = null; throw error; });
  }
  return cached;
}
