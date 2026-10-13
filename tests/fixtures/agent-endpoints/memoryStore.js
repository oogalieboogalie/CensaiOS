// In-memory stand-in for server/agentEndpoints/store.js (same function
// names and owner scoping), so route tests run without Postgres.
import crypto from 'node:crypto';
import { createEndpointToken, hashEndpointToken, tokenHint } from '../../../server/agentEndpoints/tokens.js';

export function createMemoryStore() {
  const endpoints = new Map();
  const tokens = new Map();
  const calls = [];
  const store = {
    endpoints, tokens, calls,
    AgentEndpointError: class AgentEndpointError extends Error {
      constructor(message, statusCode = 400) { super(message); this.statusCode = statusCode; }
    },
    cleanLabel: (v) => String(v || '').trim().slice(0, 60) || 'Key',
    async listEndpoints(_db, { userId, workspaceId }) {
      return [...endpoints.values()].filter((e) => e.user_id === userId && e.workspace_id === workspaceId);
    },
    async getEndpoint(_db, { userId, endpointId }) {
      const e = endpoints.get(endpointId);
      return e && e.user_id === userId ? e : null;
    },
    async upsertEndpoint(_db, input) {
      const found = [...endpoints.values()].find((e) => e.user_id === input.userId && e.workspace_id === input.workspaceId && e.card_id === input.cardId);
      if (found) return found;
      const row = {
        id: crypto.randomUUID(), user_id: input.userId, workspace_id: input.workspaceId, card_id: input.cardId,
        agent_id: input.agentId, agent_name: input.agentName, window_id: input.windowId, enabled: false, created_at: new Date(),
      };
      endpoints.set(row.id, row);
      return row;
    },
    async setEndpointEnabled(_db, { userId, endpointId, enabled }) {
      const e = await store.getEndpoint(null, { userId, endpointId });
      if (!e) return null;
      e.enabled = enabled;
      return e;
    },
    async listTokens(_db, { endpointId }) {
      return [...tokens.values()].filter((t) => t.endpoint_id === endpointId);
    },
    async createToken(_db, { endpointId, label }) {
      const token = createEndpointToken();
      const row = { id: crypto.randomUUID(), endpoint_id: endpointId, label: store.cleanLabel(label), token_hash: hashEndpointToken(token), token_hint: tokenHint(token), created_at: new Date(), last_used_at: null, revoked_at: null };
      tokens.set(row.id, row);
      return { token, row };
    },
    async revokeToken(_db, { endpointId, tokenId }) {
      const t = tokens.get(tokenId);
      if (!t || t.endpoint_id !== endpointId) return null;
      t.revoked_at = t.revoked_at || new Date();
      return t;
    },
    async findTokenByValue(_db, token) {
      const t = [...tokens.values()].find((row) => row.token_hash === hashEndpointToken(token));
      if (!t) return null;
      return { ...endpoints.get(t.endpoint_id), token_id: t.id, token_label: t.label, revoked_at: t.revoked_at };
    },
    async touchToken(_db, tokenId) { const t = tokens.get(tokenId); if (t) t.last_used_at = new Date(); },
    async logCall(_db, call) { calls.push(call); },
    async listCalls(_db, { endpointId }) {
      return calls.filter((c) => c.endpointId === endpointId).map((c, i) => ({ id: i, via: c.via, status: c.status, question: c.question, answer_chars: c.answerChars || 0, duration_ms: 1, created_at: new Date() }));
    },
  };
  return store;
}
