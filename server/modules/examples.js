// Worked example modules. Each file in ./examples is a module body that opens
// with a header comment holding the request that produced it and its manifest:
//
//   <!-- module {"request": "...", "manifest": {...}} -->
//
// They teach the generator the format and double as templates in the Add palette.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeManifest } from '../../src/lib/modules/moduleFormat.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const EXAMPLES_DIR = path.join(here, 'examples');

const HEADER = /^\s*<!--\s*module\s+([\s\S]*?)-->\s*/;

export function parseExampleFile(text, id) {
  const match = String(text).match(HEADER);
  if (!match) throw new Error(`Module example ${id} is missing its header comment.`);
  const meta = JSON.parse(match[1]);
  return {
    id,
    request: String(meta.request || ''),
    manifest: normalizeManifest(meta.manifest, { request: meta.request }),
    source: String(text).slice(match[0].length).trim(),
  };
}

export async function readModuleDir(dir) {
  const names = (await fs.promises.readdir(dir)).filter(name => name.endsWith('.html')).sort();
  return Promise.all(names.map(async (name) => (
    parseExampleFile(await fs.promises.readFile(path.join(dir, name), 'utf8'), name.replace(/\.html$/, ''))
  )));
}

let cached = null;

export function loadModuleExamples() {
  if (!cached) cached = readModuleDir(EXAMPLES_DIR).catch((err) => { cached = null; throw err; });
  return cached;
}
