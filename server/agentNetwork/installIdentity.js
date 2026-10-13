// server/agentNetwork/installIdentity.js
//
// Every censaiOS install has one Ed25519 signing key, made the first time
// it is needed. The install id is a fingerprint of the public key
// ("ci_" + 24 hex), so it cannot be claimed without the private key: a
// receipt or relay pass names its install and carries the public key, and
// anyone can check both without asking a server. The private key is kept
// encrypted in the database with the install's vault secret.

import crypto from 'node:crypto';
import pool from '../db.js';
import { decryptKey, encryptKey } from '../security/vault.js';

const VAULT_SCOPE = 'install-identity';
const INSTALL_ID = /^ci_[0-9a-f]{24}$/;

/** Public key (base64url of the raw 32 bytes) -> install id. */
export function installIdFor(publicKey) {
  const raw = Buffer.from(String(publicKey || ''), 'base64url');
  return `ci_${crypto.createHash('sha256').update(raw).digest('hex').slice(0, 24)}`;
}

export function isInstallId(value) {
  return INSTALL_ID.test(String(value || ''));
}

function rawPublicKey(keyObject) {
  // The last 32 bytes of an Ed25519 SPKI DER are the raw key.
  return keyObject.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64url');
}

function publicKeyObject(publicKey) {
  const raw = Buffer.from(String(publicKey || ''), 'base64url');
  if (raw.length !== 32) throw new Error('Not an Ed25519 public key.');
  const prefix = Buffer.from('302a300506032b6570032100', 'hex');
  return crypto.createPublicKey({ key: Buffer.concat([prefix, raw]), format: 'der', type: 'spki' });
}

/** A fresh identity: { installId, publicKey, privateKeyPem }. */
export function generateIdentity() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const pub = rawPublicKey(publicKey);
  return {
    installId: installIdFor(pub),
    publicKey: pub,
    privateKeyPem: privateKey.export({ format: 'pem', type: 'pkcs8' }),
  };
}

/** Wrap an identity so callers can sign without touching the key. */
export function identitySigner({ installId, publicKey, privateKeyPem }) {
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  return {
    installId,
    publicKey,
    sign(bytes) {
      return crypto.sign(null, Buffer.from(bytes), privateKey).toString('base64url');
    },
  };
}

/** True when signature is a valid Ed25519 signature of bytes by publicKey. */
export function verifySignature(bytes, signature, publicKey) {
  try {
    return crypto.verify(null, Buffer.from(bytes), publicKeyObject(publicKey), Buffer.from(String(signature || ''), 'base64url'));
  } catch {
    return false;
  }
}

let cached = null;

/** This install's signer, created and saved on first use. */
export async function getInstallSigner(db = pool) {
  if (cached) return cached;
  const { rows: [row] } = await db.query('SELECT install_id, public_key, private_key_encrypted FROM install_identity WHERE id = 1');
  if (row) {
    cached = identitySigner({
      installId: row.install_id,
      publicKey: row.public_key,
      privateKeyPem: decryptKey(row.private_key_encrypted, VAULT_SCOPE),
    });
    return cached;
  }
  const fresh = generateIdentity();
  await db.query(
    `INSERT INTO install_identity (id, install_id, public_key, private_key_encrypted)
     VALUES (1, $1, $2, $3) ON CONFLICT (id) DO NOTHING`,
    [fresh.installId, fresh.publicKey, encryptKey(fresh.privateKeyPem, VAULT_SCOPE)],
  );
  // Another request may have won the race; read back whatever was saved.
  return getInstallSigner(db);
}

export function __resetInstallSignerForTests() {
  cached = null;
}
