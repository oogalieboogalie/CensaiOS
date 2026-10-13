// server/agentNetwork/canonical.js
//
// One fixed way to turn a JSON value into bytes before signing it: object
// keys sorted, no spaces, undefined dropped. Both installs produce the same
// bytes for the same receipt, so a signature checks out anywhere.

import crypto from 'node:crypto';

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) out[key] = sortDeep(value[key]);
    }
    return out;
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(sortDeep(value));
}

/** SHA-256 of text, hex. Receipts keep this instead of the words. */
export function sha256Hex(text) {
  return crypto.createHash('sha256').update(String(text ?? ''), 'utf8').digest('hex');
}
