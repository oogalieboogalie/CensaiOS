// Spec 5b fingerprints: the exact card a module listing covers, in a fixed
// format. Shared by the server (which hashes and signs it) and the module
// window (which notices when a listed module has changed since).

import { normalizeManifest } from '../modules/moduleFormat.js';
import { isV3 } from '../modules/manifestV3.js';

// Cards for modules listed before manifest v3 keep their old shape, so their
// signed fingerprints still match: only the v1 permissions, nothing new.
const V1_CARD_PERMISSIONS = ['agent', 'network'];

/** JSON with sorted keys, so the same card always hashes the same. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().filter(k => value[k] !== undefined)
      .map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** What a buyer will run: the cleaned manifest and the code. */
export function moduleCard({ manifest, source }) {
  const m = normalizeManifest(manifest);
  const card = { kind: 'module', format: m.format, name: m.name, description: m.description, icon: m.icon, size: m.size, source: String(source || '') };
  if (!isV3(manifest)) return { ...card, permissions: m.permissions.filter(p => V1_CARD_PERMISSIONS.includes(p)) };
  // v3: the buyer runs exactly these permissions, sites and agent tools too.
  return { ...card, manifest: m.manifest, id: m.id, version: m.version, permissions: m.permissions, network: m.network, tools: m.tools };
}

/** SHA-256 hex of a module's card in the browser; null where hashing is unavailable. */
export async function browserModuleFingerprint(win) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || !win?.source) return null;
  try {
    const bytes = new TextEncoder().encode(canonicalJson(moduleCard(win)));
    const digest = await subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}
