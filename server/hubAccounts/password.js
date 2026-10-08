import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

export function generateToken(bytes = 32) {
  return randomBytes(bytes).toString('hex');
}

export function hashPassword(password) {
  const salt = randomBytes(16);
  return scryptAsync(password, salt, 64).then((derivedKey) => `scrypt$${salt.toString('hex')}$${derivedKey.toString('hex')}`);
}

export function verifyPassword(password, storedHash) {
  const parts = storedHash.split('$');
  const saltHex = parts[1];
  const keyHex = parts[2];
  if (!saltHex || !keyHex) return Promise.resolve(false);
  const salt = Buffer.from(saltHex, 'hex');
  const key = Buffer.from(keyHex, 'hex');
  return scryptAsync(password, salt, 64).then((derivedKey) => timingSafeEqual(key, derivedKey));
}
