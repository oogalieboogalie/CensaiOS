import { randomBytes } from 'node:crypto';

// OAuth provider pipeline contract (Phase 2.a). A provider is a plain
// definition object; this module validates the shape and keeps the
// registry. Client secrets are NEVER stored here — they are read from
// environment variables at call time (clientIdEnv / clientSecretEnv).
// This registry is intentionally separate from server/providers/registry.js
// (env-credential adapters for status checks): that file is shipped and
// load-bearing, so the OAuth dance lives beside it, not inside it.

export const PROVIDER_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const REQUIRED_METHODS = [
  'getAuthorizationUrl',
  'exchangeCodeForToken',
  'refreshToken',
  'getApiBaseUrl',
  'getCapabilities',
];

function assertValidProvider(def) {
  if (!def || typeof def !== 'object') throw new Error('OAuth provider must be an object');
  if (typeof def.id !== 'string' || !PROVIDER_ID_RE.test(def.id)) {
    throw new Error('OAuth provider id must be kebab-case [a-z0-9-]');
  }
  for (const method of REQUIRED_METHODS) {
    if (typeof def[method] !== 'function') {
      throw new Error(`OAuth provider '${def.id}' must implement ${method}()`);
    }
  }
  if (typeof def.authorizationUrl !== 'string' || !def.authorizationUrl) {
    throw new Error(`OAuth provider '${def.id}' needs an authorizationUrl`);
  }
  if (typeof def.tokenUrl !== 'string' || !def.tokenUrl) {
    throw new Error(`OAuth provider '${def.id}' needs a tokenUrl`);
  }
}

function defaultExchange(def, { code, redirectUri }) {
  return postTokenForm(def, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });
}

function defaultRefresh(def, { refreshToken }) {
  return postTokenForm(def, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
}

async function postTokenForm(def, params) {
  const clientId = (process.env[def.clientIdEnv || ''] || '').trim();
  const clientSecret = (process.env[def.clientSecretEnv || ''] || '').trim();
  if (!clientId || !clientSecret) {
    throw new Error(`OAuth provider '${def.id}' is not configured (missing client credentials in env)`);
  }
  const body = new URLSearchParams({ ...params, client_id: clientId });
  const res = await fetch(def.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error_description || data?.error || `Token endpoint HTTP ${res.status}`);
  return data;
}

const providers = new Map();

export function registerOAuthProvider(def) {
  const full = {
    // Standard code-flow URL; providers with exotic requirements override it.
    getAuthorizationUrl: ({ state, redirectUri, scopes } = {}) => {
      const clientId = (process.env[def.clientIdEnv || ''] || '').trim();
      if (!clientId) throw new Error(`OAuth provider '${def.id}' is not configured (missing client id in env)`);
      if (!redirectUri) throw new Error('redirectUri is required');
      const url = new URL(def.authorizationUrl);
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('response_type', 'code');
      const scope = [...(def.scopes || []), ...(scopes || [])].join(' ');
      if (scope) url.searchParams.set('scope', scope);
      url.searchParams.set('state', state);
      return url.toString();
    },
    exchangeCodeForToken: (args) => defaultExchange(def, args),
    refreshToken: (args) => defaultRefresh(def, args),
    getApiBaseUrl: () => def.apiBaseUrl || def.authorizationUrl,
    getCapabilities: () => (Array.isArray(def.capabilities) ? [...def.capabilities] : []),
    ...def,
  };
  assertValidProvider(full);
  providers.set(full.id, full);
  return full;
}

export function getOAuthProvider(id) {
  if (typeof id !== 'string' || !PROVIDER_ID_RE.test(id)) return null;
  return providers.get(id) || null;
}

// Metadata only — never credentials, never tokens.
export function listOAuthProviders() {
  return [...providers.values()].map((p) => ({
    id: p.id,
    label: p.label || p.id,
    capabilities: p.getCapabilities(),
    configured: Boolean((process.env[p.clientIdEnv || ''] || '').trim() && (process.env[p.clientSecretEnv || ''] || '').trim()),
  }));
}

export function clearOAuthProvidersForTests() {
  providers.clear();
}

export function newStateToken() {
  return randomBytes(32).toString('base64url');
}
