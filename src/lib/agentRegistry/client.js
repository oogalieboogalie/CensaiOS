// src/lib/agentRegistry/client.js
//
// Browser-side facade for the agent registry. Combines:
//   - REST surface (D2): /api/agent-registry/cards/*
//   - WS surface  (D3):  /ws/agent-registry
//   - durable workspace install set (server-owned)
//
// The legacy localStorage key remains exported for recovery tooling, but this
// client never reads, writes, imports, or deletes it.

import { createAgentRegistryClient } from './wsClient.js';
import { createAgentCardInstallClient } from './installClient.js';
import { createFamilyToolRegistryClient } from './toolClient.js';
import { createToolPackageClient } from './packageClient.js';
import { createA2AImportClient } from './importClient.js';

export const INSTALLED_STORAGE_KEY = 'homebase.agentRegistry.installed.v1';
const BASE_PATH = '/api/agent-registry';

const FETCH_MISS = Symbol('registry.fetch.miss');

async function readJson(res, context) {
  // Empty body is allowed for DELETE (204) — return null.
  if (res.status === 204) return null;
  let data;
  try { data = await res.json(); }
  catch { data = null; }
  if (!res.ok) {
    const message = (data && data.error) || `${context} failed (HTTP ${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

/**
 * Thin REST wrapper. Each method maps 1:1 to a D2 endpoint.
 * @param {object} opts
 * @param {typeof fetch} [opts.fetch]  injected for tests
 */
function createRestClient({ fetch: fetchImpl = (typeof fetch !== 'undefined' ? fetch : null), workspaceId: activeWorkspaceId = null } = {}) {
  if (!fetchImpl) {
    throw new Error('createRegistryClient: no fetch available — pass one explicitly in non-browser environments');
  }

  async function listCards({ visibility, ownerId, workspaceId, limit, offset } = {}) {
    const params = new URLSearchParams();
    if (visibility) params.set('visibility', visibility);
    if (ownerId) params.set('owner_id', ownerId);
    const scope = workspaceId || activeWorkspaceId;
    if (scope) params.set('workspace_id', scope);
    if (limit != null) params.set('limit', String(limit));
    if (offset != null) params.set('offset', String(offset));
    const qs = params.toString();
    const url = `${BASE_PATH}/cards${qs ? `?${qs}` : ''}`;
    const res = await fetchImpl(url, { credentials: 'same-origin' });
    return readJson(res, 'listCards');
  }

  async function getCard(id) {
    if (!id) throw new TypeError('getCard requires id');
    const res = await fetchImpl(`${BASE_PATH}/cards/${encodeURIComponent(id)}`, { credentials: 'same-origin' });
    return readJson(res, 'getCard');
  }

  async function createCard(body) {
    if (!body || typeof body !== 'object') throw new TypeError('createCard requires body');
    const res = await fetchImpl(`${BASE_PATH}/cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(activeWorkspaceId ? { ...body, workspaceId: activeWorkspaceId } : body),
    });
    return readJson(res, 'createCard');
  }

  async function updateCard(id, patch) {
    if (!id) throw new TypeError('updateCard requires id');
    if (!patch || typeof patch !== 'object') throw new TypeError('updateCard requires patch object');
    const res = await fetchImpl(`${BASE_PATH}/cards/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(patch),
    });
    return readJson(res, 'updateCard');
  }

  async function deleteCard(id) {
    if (!id) throw new TypeError('deleteCard requires id');
    const res = await fetchImpl(`${BASE_PATH}/cards/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });
    return readJson(res, 'deleteCard');
  }

  return { listCards, getCard, createCard, updateCard, deleteCard };
}

/**
 * Create the registry facade.
 * @param {object} [opts]
 * @param {typeof fetch} [opts.fetch]       REST transport (default: global fetch)
 * @param {Function}     [opts.wsFactory]   WS client factory (default: createAgentRegistryClient)
 * @param {string}       opts.workspaceId  authoritative install scope
 */
export function createRegistryClient(opts = {}) {
  const workspaceId = String(opts.workspaceId || '').trim();
  const rest = createRestClient({ fetch: opts.fetch, workspaceId });
  const installs = workspaceId
    ? createAgentCardInstallClient({ fetch: opts.fetch, workspaceId })
    : null;
  const toolRegistry = workspaceId
    ? createFamilyToolRegistryClient({ fetch: opts.fetch, workspaceId })
    : null;
  const toolPackages = workspaceId
    ? createToolPackageClient({ fetch: opts.fetch, workspaceId })
    : null;
  const agentImports = workspaceId
    ? createA2AImportClient({ fetch: opts.fetch, workspaceId })
    : null;
  const wsClient = (opts.wsFactory || createAgentRegistryClient)({
    fetch: opts.fetch,
    socketFactory: opts.socketFactory,
  });

  return {
    listCards: rest.listCards,
    getCard: rest.getCard,
    createCard(body) {
      if (!workspaceId) throw new Error('Open a workspace before publishing an AgentCard.');
      return rest.createCard(body);
    },
    updateCard: rest.updateCard,
    deleteCard: rest.deleteCard,
    importA2A(cardUrl) {
      if (!agentImports) throw new Error('Open a workspace before importing an agent.');
      return agentImports.importA2A(cardUrl);
    },
    importN8NChat(input) {
      if (!agentImports) throw new Error('Open a workspace before importing an agent.');
      return agentImports.importN8NChat(input);
    },

    subscribeToCard(cardId, onEvent) {
      wsClient.connect();
      return wsClient.subscribe(cardId, onEvent);
    },
    callCard(cardId, payload, options) {
      if (!workspaceId) throw new Error('Open a workspace before calling an AgentCard.');
      wsClient.connect();
      return wsClient.call(cardId, payload, workspaceId ? { ...(options || {}), workspaceId } : options);
    },
    isReady() { return wsClient.isReady(); },
    closeSocket() { wsClient.close(); },

    installCard(cardId) {
      if (!installs) throw new Error('Open a workspace before installing an AgentCard.');
      return installs.installCard(cardId);
    },
    uninstallCard(cardId) {
      if (!installs) throw new Error('Open a workspace before removing an AgentCard.');
      return installs.uninstallCard(cardId);
    },
    listInstalled() {
      if (!installs) throw new Error('Open a workspace before loading installed AgentCards.');
      return installs.listInstalled();
    },
    listTools(agentId) {
      if (!toolRegistry) throw new Error('Open a workspace before loading the tool registry.');
      return toolRegistry.listTools(agentId);
    },
    listToolPackages() {
      if (!toolPackages) throw new Error('Open a workspace before loading add-ons.');
      return toolPackages.listToolPackages();
    },
    installToolPackage(packageId) {
      if (!toolPackages) throw new Error('Open a workspace before installing add-ons.');
      return toolPackages.installToolPackage(packageId);
    },
    removeToolPackage(packageId) {
      if (!toolPackages) throw new Error('Open a workspace before removing add-ons.');
      return toolPackages.removeToolPackage(packageId);
    },
  };
}

export { createAgentRegistryClient } from './wsClient.js';
export { FETCH_MISS };
