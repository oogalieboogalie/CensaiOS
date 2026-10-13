// ═══════════════════════════════════════════════════════════════════
//  PROVIDER SERVICE REGISTRY
//  Server counterpart to the (browser-side) Window Integration Contract.
//
//  A window's manifest declares a provider in its `integration` block
//  (src/lib/windowIntegrationTypes.js + docs/WINDOW_INTEGRATION_SPEC.md). THIS
//  registry implements that provider on the server: it knows how to resolve the
//  provider's credential, whether it is configured, and how to run a lightweight
//  connection test. Connecting/testing an integration therefore needs no one-off
//  branching in routes — every provider flows through the same shape.
//
//  Credential resolution defaults to env vars via getSecret(), the model every
//  existing provider (github / mailcow / google) already uses. `getCredential(ctx)`
//  is the seam where per-user / per-tenant DB-backed token storage plugs in later
//  (Phase 2 multi-tenancy). Secrets are NEVER persisted in workspace state and
//  NEVER serialized back to the browser — only connection state is.
// ═══════════════════════════════════════════════════════════════════

import { getSecret } from '../secrets.js';
import { getOAuthClient } from '../calendar.js';

import { CONNECTION_STATES } from '../../src/lib/windowIntegrationTypes.js';
import { INTEGRATION_WINDOW_MANIFESTS } from '../../src/lib/windowManifest.js';

/** Build a credential resolver that reads a single env var (today's model). */
function envCredential(envName) {
  return async () => getSecret(envName);
}

// Each adapter:
//   id           provider slug — MUST match a manifest integration.provider.id
//   authMode     how it authenticates (mirrors the manifest authMode)
//   secretEnv    env var holding the credential (the current single-tenant model)
//   getCredential(ctx) -> string         resolve the credential (default: env)
//   test(ctx) -> { ok, detail? }         lightweight authenticated probe (optional)
const ADAPTERS = {
  github: {
    id: 'github',
    authMode: 'apiKey',
    secretEnv: 'GITHUB_TOKEN',
    getCredential: envCredential('GITHUB_TOKEN'),
    async test(ctx) {
      const token = await this.getCredential(ctx);
      if (!token) return { ok: false, detail: 'GITHUB_TOKEN not configured' };
      const res = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'Homebase-Agent',
          Accept: 'application/vnd.github.v3+json',
        },
      });
      if (!res.ok) return { ok: false, detail: `GitHub ${res.status}` };
      const user = await res.json();
      return { ok: true, detail: user?.login ? `authenticated as ${user.login}` : 'authenticated' };
    },
  },

  // Reference adapter that pairs with the demo manifest integration. It has no
  // real backend: its "test" just reflects whether a key is configured, proving
  // the registry shape end to end without a live external service.
  'demo-provider': {
    id: 'demo-provider',
    authMode: 'apiKey',
    secretEnv: 'DEMO_PROVIDER_KEY',
    getCredential: envCredential('DEMO_PROVIDER_KEY'),
    async test(ctx) {
      const key = await this.getCredential(ctx);
      return key
        ? { ok: true, detail: 'demo key present' }
        : { ok: false, detail: 'no demo key configured' };
    },
  },

  linear: {
    id: 'linear',
    authMode: 'apiKey',
    secretEnv: 'LINEAR_API_KEY',
    getCredential: envCredential('LINEAR_API_KEY'),
    async test(ctx) {
      const key = await this.getCredential(ctx);
      if (!key) return { ok: false, detail: 'LINEAR_API_KEY not configured' };
      const res = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: key },
        body: JSON.stringify({ query: '{ viewer { id name } }' }),
      });
      if (!res.ok) return { ok: false, detail: `Linear ${res.status}` };
      const json = await res.json();
      const name = json?.data?.viewer?.name;
      return name ? { ok: true, detail: `authenticated as ${name}` } : { ok: false, detail: 'no viewer' };
    },
  },

  'google-sheets': {
    id: 'google-sheets',
    authMode: 'oauth2',
    async getCredential(ctx) {
      const userId = ctx?.req?.session?.userId;
      const client = await getOAuthClient(userId);
      return client ? 'oauth-configured' : null;
    },
    async test(ctx) {
      const userId = ctx?.req?.session?.userId;
      const client = await getOAuthClient(userId);
      if (!client) return { ok: false, detail: 'Not configured' };
      try {
        const res = await fetch('https://sheets.googleapis.com/$discovery/rest?version=v4');
        if (!res.ok) return { ok: false, detail: 'Google Sheets API unreachable' };
        return { ok: true, detail: 'OAuth configured' };
      } catch (err) {
        return { ok: false, detail: err.message };
      }
    },
  },

  slack: {
    id: 'slack',
    authMode: 'oauth2',
    getCredential: async () => 'oauth-placeholder',
    async test() { return { ok: true, detail: 'Slack Stub' }; }
  },

  jira: {
    id: 'jira',
    authMode: 'oauth2',
    getCredential: async () => 'oauth-placeholder',
    async test() { return { ok: true, detail: 'Jira Stub' }; }
  },

  asana: {
    id: 'asana',
    authMode: 'oauth2',
    getCredential: async () => 'oauth-placeholder',
    async test() { return { ok: true, detail: 'Asana Stub' }; }
  },

  monday: {
    id: 'monday',
    authMode: 'oauth2',
    getCredential: async () => 'oauth-placeholder',
    async test() { return { ok: true, detail: 'Monday Stub' }; }
  },

  teams: {
    id: 'teams',
    authMode: 'oauth2',
    getCredential: async () => 'oauth-placeholder',
    async test() { return { ok: true, detail: 'Teams Stub' }; }
  },

  'censai-context': {
    id: 'censai-context',
    authMode: 'none',
    getCredential: async () => 'none',
    async test() { return { ok: true, detail: 'Censai Context Feed' }; }
  },
};

export function getProviderAdapter(id) {
  return ADAPTERS[id] || null;
}

export function listProviderAdapters() {
  return Object.values(ADAPTERS);
}

export async function isProviderConfigured(adapter, ctx) {
  if (!adapter || typeof adapter.getCredential !== 'function') return false;
  const cred = await adapter.getCredential(ctx);
  return Boolean(cred);
}

/**
 * Resolve a normalized connection state (a CONNECTION_STATES value). With
 * `runTest:false` (default) we report connected-if-configured — cheap, no
 * network. With `runTest:true` we run the adapter's live probe.
 */
export async function resolveConnectionState(adapter, ctx = {}, { runTest = false } = {}) {
  if (!adapter) {
    return { state: CONNECTION_STATES.ERROR, configured: false, detail: 'unknown provider' };
  }
  const configured = await isProviderConfigured(adapter, ctx);
  if (!configured) {
    return { state: CONNECTION_STATES.DISCONNECTED, configured: false };
  }
  if (!runTest || typeof adapter.test !== 'function') {
    return { state: CONNECTION_STATES.CONNECTED, configured: true };
  }
  try {
    const result = await adapter.test(ctx);
    return result?.ok
      ? { state: CONNECTION_STATES.CONNECTED, configured: true, detail: result.detail }
      : { state: CONNECTION_STATES.ERROR, configured: true, detail: result?.detail };
  } catch (e) {
    return { state: CONNECTION_STATES.ERROR, configured: true, detail: String(e?.message || e) };
  }
}

/**
 * Provider ids declared by window manifests that have no server adapter yet.
 * Lets a test (and ops) catch a manifest integration that can't actually
 * connect — the contract says "register a provider", this proves it's wired.
 */
export function getUnimplementedProviderIds() {
  const declared = INTEGRATION_WINDOW_MANIFESTS
    .map((m) => m.integration?.provider?.id)
    .filter(Boolean);
  return declared.filter((id) => !ADAPTERS[id]);
}
