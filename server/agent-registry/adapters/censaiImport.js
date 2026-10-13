// Import an agent someone shared from their own censaiOS (the Share panel's
// address and key). The agent becomes an ordinary registry card on this
// board, owned by the person who added it, so the usual help-request rules
// apply: people here can ask it at once, and agents here can ask it on
// their own only after an owner or admin pins it. The key goes into the
// importer's key vault (provider "censai:<card digest>"), never into the
// card. The other side agreed to be asked when its owner turned sharing on
// and handed out this key; revoking the key there ends it.

import crypto from 'crypto';
import pool from '../../db.js';
import { decryptKey, encryptKey } from '../../security/vault.js';
import { isEndpointTokenShape } from '../../agentEndpoints/tokens.js';
import { parseAgentAddress } from '../../agentNetwork/address.js';
import { createExternalGuardedFetch } from './egress.js';

export const PROTOCOL_VERSION = 'censai-ask-v1';
const PROBE_TIMEOUT_MS = 15_000;

export class CensaiImportError extends Error {
  constructor(message, code = 'CENSAI_IMPORT_INVALID', statusCode = 422) {
    super(message);
    this.name = 'CensaiImportError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

const egressError = (message, suffix, statusCode) => new CensaiImportError(message, `CENSAI_${suffix}`, statusCode);

// user_api_keys.provider is at most 50 characters.
export const vaultProvider = (cardId) => `censai:${String(cardId).replace(/^ext:censai:/, '')}`;

function cleanName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

/** The agent's name and job from its MCP tool ("Ask Atlas" -> "Atlas"). */
export function agentFromTool(tool) {
  const title = cleanName(tool?.title || '');
  const name = title.replace(/^Ask\s+/i, '') || cleanName(String(tool?.name || '').replace(/^ask_/, '').replace(/_/g, ' '));
  return { name: name || 'Shared agent', description: String(tool?.description || '').slice(0, 2000) };
}

async function probe(address, key, options) {
  const guarded = options.guardedFetch || createExternalGuardedFetch({ ...options, errorFactory: egressError });
  let res;
  try {
    res = await guarded(address.mcpUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-06-18',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      signal: AbortSignal.timeout(options.timeoutMs || PROBE_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof CensaiImportError) throw error;
    return { reachable: false };
  }
  if (res.status === 401) throw new CensaiImportError('That key does not open this agent. Ask its owner for a fresh key.', 'CENSAI_KEY_REFUSED', 422);
  if (res.status === 403) throw new CensaiImportError('Its owner has sharing turned off right now.', 'CENSAI_SHARING_OFF', 422);
  if (!res.ok) return { reachable: false };
  const data = await res.json().catch(() => null);
  const tool = data?.result?.tools?.[0];
  if (!tool) throw new CensaiImportError('That address answered, but not like a censaiOS agent.', 'CENSAI_NOT_AN_AGENT', 422);
  return { reachable: true, ...agentFromTool(tool) };
}

/** Check the address and key. Returns what the card needs. */
export async function inspectCensaiImport({ address: rawAddress, key: rawKey, name: rawName }, options = {}) {
  const address = parseAgentAddress(rawAddress);
  const key = String(rawKey || '').trim();
  if (!isEndpointTokenShape(key)) {
    throw new CensaiImportError('Paste the agent key too. It starts with cak_ and is shown once in the Share panel.', 'CENSAI_KEY_REQUIRED', 400);
  }
  const seen = await probe(address, key, options);
  const typed = cleanName(rawName);
  if (!seen.reachable && !typed) {
    throw new CensaiImportError(
      'That computer did not answer. Type the agent\'s name to add it anyway; questions wait in line until it is back.',
      'CENSAI_OFFLINE', 422,
    );
  }
  const name = typed || seen.name;
  const where = address.viaRelay ? 'through the relay' : new URL(address.mcpUrl).host;
  const description = `${seen.name || name}, shared from another censaiOS (${where}). It answers with its owner's model, and every question leaves a signed receipt on both sides.`;
  const canonical = {
    kind: 'censai', protocolVersion: PROTOCOL_VERSION, endpoint: address.mcpUrl,
    installId: address.installId, endpointId: address.endpointId, viaRelay: address.viaRelay,
  };
  const sourceDigest = crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  return { ...canonical, name, description, key, verified: seen.reachable, sourceDigest };
}

function importedCardId(workspaceId, endpointId) {
  const digest = crypto.createHash('sha256').update(`${workspaceId}\0censai\0${endpointId}`).digest('hex');
  return `ext:censai:${digest.slice(0, 32)}`;
}

function importMetadata(inspected) {
  return {
    acceptsHelpRequests: true,
    import: {
      kind: 'censai', address: inspected.endpoint, installId: inspected.installId, endpointId: inspected.endpointId,
      viaRelay: inspected.viaRelay, sourceDigest: inspected.sourceDigest, importedAt: new Date().toISOString(),
    },
    executor: {
      kind: 'censai', status: 'executable', protocolVersion: PROTOCOL_VERSION,
      transport: 'HTTP_JSON', endpoint: inspected.endpoint, sourceDigest: inspected.sourceDigest,
    },
  };
}

export async function upsertCensaiImport({ db = pool, workspaceId, userId, inspected }) {
  const id = importedCardId(String(workspaceId), inspected.endpointId);
  const skills = [{
    id: 'ask', name: `Ask ${inspected.name}`, description: inspected.description.slice(0, 500),
    tags: ['censaios', 'shared-agent', inspected.viaRelay ? 'relay' : 'direct'],
  }];
  await db.query(
    `INSERT INTO user_api_keys (user_id, provider, api_key_encrypted, updated_at) VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id, provider) DO UPDATE SET api_key_encrypted = $3, updated_at = NOW()`,
    [Number(userId), vaultProvider(id), encryptKey(inspected.key, Number(userId))],
  );
  const { rows } = await db.query(
    `INSERT INTO agent_cards
       (id, name, description, version, skills, endpoint, auth, owner_id, workspace_id, visibility, metadata)
     VALUES ($1, $2, $3, '1.0.0', $4::jsonb, $5, '{"type":"bearer"}'::jsonb, $6, $7, 'workspace', $8::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       name=EXCLUDED.name, description=EXCLUDED.description, skills=EXCLUDED.skills,
       endpoint=EXCLUDED.endpoint, auth=EXCLUDED.auth, owner_id=EXCLUDED.owner_id,
       visibility='workspace', metadata=EXCLUDED.metadata, updated_at=NOW(), deleted_at=NULL
     WHERE agent_cards.workspace_id=EXCLUDED.workspace_id
       AND agent_cards.metadata->'import'->>'kind'='censai'
     RETURNING *, (xmax = 0) AS imported_created`,
    [id, inspected.name, inspected.description, JSON.stringify(skills), inspected.endpoint,
      String(userId), String(workspaceId), JSON.stringify(importMetadata(inspected))],
  );
  if (!rows[0]) throw new CensaiImportError('That agent conflicts with a card already here.', 'CENSAI_IMPORT_CONFLICT', 409);
  const card = rows[0];
  const created = card.imported_created === true || card.imported_created === 'true';
  delete card.imported_created;
  return { card, created };
}

/** The agent key for an imported card, from its owner's vault ('' when missing). */
export async function loadCensaiKey(db, card) {
  const userId = Number(card?.owner_id);
  if (!Number.isInteger(userId)) return '';
  const { rows } = await db.query('SELECT api_key_encrypted FROM user_api_keys WHERE user_id = $1 AND provider = $2',
    [userId, vaultProvider(card.id)]);
  return rows[0] ? decryptKey(rows[0].api_key_encrypted, userId) : '';
}

export const __test__ = { importedCardId, importMetadata };
