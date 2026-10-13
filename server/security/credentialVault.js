import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'crypto';
import {
  optionalSecret,
  requireProductionSecret,
} from '../secrets.js';

const VERSION = 'v1';

function masterSecret() {
  return requireProductionSecret('CENSAI_VAULT_SECRET')
    || optionalSecret('CENSAI_VAULT_SECRET')
    || 'censai-local-credential-vault-development-key';
}

function deriveKey(ownerId, provider) {
  return Buffer.from(hkdfSync(
    'sha256',
    masterSecret(),
    String(ownerId),
    `oauth:${provider}`,
    32
  ));
}

export function encryptCredential(plaintext, { ownerId, provider }) {
  if (!plaintext) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(ownerId, provider), iv);
  const encrypted = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final(),
  ]);
  const payload = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
  return `${VERSION}:${payload}`;
}

export function decryptCredential(ciphertext, { ownerId, provider }) {
  if (!ciphertext) return null;
  const [version, payload] = String(ciphertext).split(':', 2);
  if (version !== VERSION || !payload) throw new Error('Unsupported credential ciphertext');
  const bytes = Buffer.from(payload, 'base64');
  if (bytes.length < 29) throw new Error('Invalid credential ciphertext');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    deriveKey(ownerId, provider),
    bytes.subarray(0, 12)
  );
  decipher.setAuthTag(bytes.subarray(12, 28));
  return decipher.update(bytes.subarray(28), null, 'utf8') + decipher.final('utf8');
}
