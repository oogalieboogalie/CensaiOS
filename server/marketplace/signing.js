// Spec 5b "verified identity": a listing's fingerprint is a SHA-256 of its
// card in a fixed format, and Censai signs a certificate over it with its own
// Ed25519 key. The private key is stored encrypted with the server vault
// secret; the public key is served at /api/marketplace/public-key so anyone
// can check a certificate.

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  sign,
  verify,
} from 'crypto';
import { optionalSecret, requireProductionSecret } from '../secrets.js';
import { canonicalJson } from '../../src/lib/marketplace/moduleCard.js';

export { canonicalJson };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS marketplace_signing_keys (
  id           TEXT PRIMARY KEY,
  public_key   TEXT NOT NULL,
  private_key  TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`;

const KEY_ID = 'censai-marketplace-1';
const cache = new WeakMap();

function vaultKey() {
  const secret = requireProductionSecret('CENSAI_VAULT_SECRET')
    || optionalSecret('CENSAI_VAULT_SECRET')
    || 'censai-marketplace-signing-key';
  return Buffer.from(hkdfSync('sha256', secret, '', 'marketplace-signing-key', 32));
}

function seal(text) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', vaultKey(), iv);
  const body = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')}`;
}

function unseal(sealed) {
  const [version, payload] = String(sealed).split(':', 2);
  if (version !== 'v1' || !payload) throw new Error('Unsupported signing key format');
  const bytes = Buffer.from(payload, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', vaultKey(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return decipher.update(bytes.subarray(28), null, 'utf8') + decipher.final('utf8');
}

export function fingerprint(card) {
  return createHash('sha256').update(canonicalJson(card)).digest('hex');
}

async function loadKeys(db) {
  await db.query(SCHEMA);
  const { rows } = await db.query('SELECT id, public_key, private_key FROM marketplace_signing_keys WHERE id=$1', [KEY_ID]);
  if (rows[0]) {
    return { id: rows[0].id, publicKey: rows[0].public_key, privateKey: createPrivateKey(unseal(rows[0].private_key)) };
  }
  const pair = generateKeyPairSync('ed25519');
  const publicPem = pair.publicKey.export({ type: 'spki', format: 'pem' });
  const privatePem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' });
  await db.query(
    'INSERT INTO marketplace_signing_keys (id, public_key, private_key) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
    [KEY_ID, publicPem, seal(privatePem)],
  );
  // Another request may have won the insert; read back whichever key is stored.
  const { rows: stored } = await db.query('SELECT id, public_key, private_key FROM marketplace_signing_keys WHERE id=$1', [KEY_ID]);
  return { id: stored[0].id, publicKey: stored[0].public_key, privateKey: createPrivateKey(unseal(stored[0].private_key)) };
}

export function signingKeys(db) {
  if (!cache.has(db)) cache.set(db, loadKeys(db).catch((err) => { cache.delete(db); throw err; }));
  return cache.get(db);
}

/** The signed statement: which listing, which exact card, who sells it, how it scored. */
export function certificateBody({ listingId, fingerprint: fp, sellerId, checks, issuedAt }) {
  return {
    v: 1,
    listingId,
    fingerprint: fp,
    sellerId,
    score: `${checks.score}/${checks.total}`,
    suite: `${checks.suite}@${checks.version}`,
    issuedAt,
  };
}

export async function signCertificate(db, body) {
  const keys = await signingKeys(db);
  const signature = sign(null, Buffer.from(canonicalJson(body)), keys.privateKey).toString('base64');
  return { ...body, keyId: keys.id, signature };
}

/** True only when the signature is Censai's and covers exactly this body. */
export function verifyCertificate(publicKeyPem, certificate) {
  if (!certificate?.signature) return false;
  const { signature, keyId: _keyId, ...body } = certificate;
  try {
    return verify(null, Buffer.from(canonicalJson(body)), createPublicKey(publicKeyPem), Buffer.from(signature, 'base64'));
  } catch {
    return false;
  }
}
