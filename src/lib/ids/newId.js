// One ID maker for the whole board. Browsers only offer crypto.randomUUID on
// https or localhost, so a board opened at a plain-http address (the laptop
// reaching the PC at http://192.168.1.20:3002) had no way to add a window.
// This falls back to crypto.getRandomValues, which every browser offers, and
// says so in the app log once per page load.
import { logToApp } from '../appLog/browserLog.js';

let warned = false;

function hex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** A random version-4 UUID built from crypto.getRandomValues (or Math.random as a last resort). */
export function fallbackUuid(cryptoObj = globalThis.crypto) {
  const bytes = new Uint8Array(16);
  if (cryptoObj?.getRandomValues) cryptoObj.getRandomValues(bytes);
  else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = hex(bytes);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function warnOnce() {
  if (warned) return;
  warned = true;
  const where = typeof location !== 'undefined' ? location.origin : 'this address';
  logToApp('warn', `ids: ${where} has no crypto.randomUUID (plain http); using the fallback ID maker`, { where: 'board' });
}

/** A new random ID, on any address the board is opened at. */
export function newId() {
  const cryptoObj = globalThis.crypto;
  if (typeof cryptoObj?.randomUUID === 'function') return cryptoObj.randomUUID();
  warnOnce();
  return fallbackUuid(cryptoObj);
}

/**
 * Give crypto.randomUUID to code we don't own (drawing, collaboration
 * libraries) on plain-http addresses too. Does nothing where it exists.
 */
export function installRandomUuid(cryptoObj = globalThis.crypto) {
  if (!cryptoObj || typeof cryptoObj.randomUUID === 'function') return false;
  try {
    Object.defineProperty(cryptoObj, 'randomUUID', { value: () => { warnOnce(); return fallbackUuid(cryptoObj); }, configurable: true, writable: true });
    return true;
  } catch {
    return false;
  }
}
