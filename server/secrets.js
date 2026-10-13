import { getConfiguredRuntimeMode } from './config/productIdentity.js';

let initialized = false;

export const PRODUCTION_REQUIRED_SECRETS = Object.freeze([
  'SESSION_SECRET',
  'JOURNAL_SECRET',
  'CENSAI_VAULT_SECRET',
]);

function isProductionEnvironment() {
  return process.env.NODE_ENV === 'production'
    || getConfiguredRuntimeMode() === 'cloud_saas';
}

function readSecret(name) {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

export async function initSecrets() {
  for (const name of PRODUCTION_REQUIRED_SECRETS) {
    requireProductionSecret(name);
  }
  if (!initialized) {
    console.log('Secret configuration validated');
    initialized = true;
  }
}

export function requireSecret(name) {
  const value = readSecret(name);
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
}

export function optionalSecret(name, fallback = null) {
  return readSecret(name) || fallback;
}

export function requireProductionSecret(name) {
  if (!isProductionEnvironment()) return optionalSecret(name);
  return requireSecret(name);
}

export function getSecret(name) {
  return optionalSecret(name, '');
}
