import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
  createHash,
} from 'crypto';
import { requireProductionSecret, optionalSecret } from '../secrets.js';

const VERSION = 'v1';

function masterSecret() {
  return requireProductionSecret('CENSAI_VAULT_SECRET')
    || optionalSecret('CENSAI_VAULT_SECRET')
    || 'censai-hub-account-email-encryption-key';
}

function deriveKey() {
  return Buffer.from(hkdfSync('sha256', masterSecret(), '', 'hub-account-email', 32));
}

export function encryptEmail(plaintext) {
  if (!plaintext) return null;
  const key = deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(String(plaintext).toLowerCase(), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, encrypted]).toString('base64');
  return `${VERSION}:${payload}`;
}

export function decryptEmail(ciphertext) {
  if (!ciphertext) return null;
  const [version, payload] = String(ciphertext).split(':', 2);
  if (version !== VERSION || !payload) throw new Error('Unsupported email ciphertext version');
  const key = deriveKey();
  const bytes = Buffer.from(payload, 'base64');
  if (bytes.length < 29) throw new Error('Invalid email ciphertext');
  const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return decipher.update(bytes.subarray(28), null, 'utf8') + decipher.final('utf8');
}

export function hashEmail(email) {
  return createHash('sha256').update(String(email).toLowerCase().trim()).digest('hex');
}