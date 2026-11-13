// Ed25519 checks for a Gatekeeper clear. The app holds only a public key.
// Signed text: homebase-clear-v1|owner/name|pull request|commit
// A revoke uses homebase-revoke-v1 with the same rest, so a clear cannot be replayed as one.
import { createPrivateKey, createPublicKey, verify } from 'node:crypto';

export const GITHUB_ACTIONS_APP_ID = 15368;

const ED25519_SPKI = Buffer.from('302a300506032b6570032100', 'hex');

export function canonicalRepo(repo) {
  return String(repo || '').trim().toLowerCase();
}

export function clearMessage(repo, number, sha) {
  return `homebase-clear-v1|${canonicalRepo(repo)}|${Number(number)}|${String(sha).trim().toLowerCase()}`;
}

export function revokeMessage(repo, number, sha) {
  return `homebase-revoke-v1|${canonicalRepo(repo)}|${Number(number)}|${String(sha).trim().toLowerCase()}`;
}

function asText(material) {
  return String(material || '').trim().replace(/\\n/g, '\n');
}

function isPrivateKey(text) {
  if (/PRIVATE KEY/i.test(text)) return true;
  try {
    if (text.includes('BEGIN')) {
      createPrivateKey(text);
      return true;
    }
    const raw = Buffer.from(text, 'base64');
    if (raw.length > 32) {
      createPrivateKey({ key: raw, format: 'der', type: 'pkcs8' });
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function onlyEd25519(key) {
  return key?.asymmetricKeyType === 'ed25519' ? key : null;
}

export function publicKeyFrom(material) {
  const text = asText(material);
  if (!text || isPrivateKey(text)) return null;
  try {
    if (text.includes('BEGIN PUBLIC KEY')) return onlyEd25519(createPublicKey(text));
    const raw = Buffer.from(text, 'base64');
    if (raw.length !== 32) return null;
    const wrapped = Buffer.concat([ED25519_SPKI, raw]);
    return onlyEd25519(createPublicKey({ key: wrapped, format: 'der', type: 'spki' }));
  } catch {
    return null;
  }
}

export function signatureMatches(publicKey, message, sigB64) {
  if (!publicKey || !message || !sigB64) return false;
  try {
    const sig = Buffer.from(String(sigB64), 'base64');
    if (sig.length !== 64) return false;
    return verify(null, Buffer.from(String(message)), publicKey, sig);
  } catch {
    return false;
  }
}
