import crypto from 'crypto';
import pool from '../../db.js';
import { assertExternalEgressUrl } from './egress.js';

const PROTOCOL_VERSION = 'n8n-chat-v1';

export class N8NAdapterError extends Error {
  constructor(message, code = 'N8N_IMPORT_INVALID', statusCode = 422) {
    super(message);
    this.name = 'N8NAdapterError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function n8nEgressError(message, suffix, statusCode) {
  return new N8NAdapterError(message, `N8N_${suffix}`, statusCode);
}

function boundedText(value, label, max) {
  const result = String(value || '').trim();
  if (!result) throw new N8NAdapterError(`${label} is required.`, 'N8N_IMPORT_INPUT_REQUIRED', 400);
  if (result.length > max) throw new N8NAdapterError(`${label} is too long.`, 'N8N_IMPORT_INVALID', 400);
  return result;
}

function sourceDigest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function normalizeN8NImportInput(input) {
  return {
    name: boundedText(input?.name, 'name', 160),
    description: boundedText(input?.description, 'description', 2000),
    webhookUrl: boundedText(input?.webhookUrl, 'webhookUrl', 2048),
  };
}

export async function inspectN8NImport(input, options = {}) {
  const { name, description, webhookUrl } = normalizeN8NImportInput(input);
  const endpoint = (await assertExternalEgressUrl(webhookUrl, {
    ...options, errorFactory: n8nEgressError,
  })).toString();
  const canonical = { kind: 'n8n_chat', protocolVersion: PROTOCOL_VERSION, endpoint, name, description };
  return { ...canonical, sourceDigest: sourceDigest(canonical) };
}

function importedCardId(workspaceId, endpoint) {
  const digest = crypto.createHash('sha256').update(`${workspaceId}\0${endpoint}`).digest('hex');
  return `ext:n8n:${digest.slice(0, 32)}`;
}

function importMetadata(inspected) {
  return {
    import: {
      kind: 'n8n_chat', webhookUrl: inspected.endpoint, sourceDigest: inspected.sourceDigest,
      importedAt: new Date().toISOString(),
    },
    executor: {
      kind: 'n8n_chat', status: 'executable', protocolVersion: inspected.protocolVersion,
      transport: 'HTTP_JSON', endpoint: inspected.endpoint, sourceDigest: inspected.sourceDigest,
    },
  };
}

export async function upsertN8NImport({
  db = pool, workspaceId, userId, inspected,
}) {
  const id = importedCardId(String(workspaceId), inspected.endpoint);
  const metadata = importMetadata(inspected);
  const skills = [{
    id: 'chat', name: 'Chat',
    description: 'Send one text message to this n8n Chat Trigger workflow.',
  }];
  const { rows } = await db.query(
    `INSERT INTO agent_cards
       (id, name, description, version, skills, endpoint, auth, owner_id, workspace_id, visibility, metadata)
     VALUES ($1, $2, $3, '1.0.0', $4::jsonb, $5, '{"type":"none"}'::jsonb, $6, $7, 'workspace', $8::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       name=EXCLUDED.name, description=EXCLUDED.description, version=EXCLUDED.version,
       skills=EXCLUDED.skills, endpoint=EXCLUDED.endpoint, auth=EXCLUDED.auth,
       visibility='workspace', metadata=EXCLUDED.metadata, updated_at=NOW(), deleted_at=NULL
     WHERE agent_cards.workspace_id=EXCLUDED.workspace_id
       AND agent_cards.metadata->'import'->>'kind'='n8n_chat'
       AND agent_cards.metadata->'import'->>'webhookUrl'=EXCLUDED.metadata->'import'->>'webhookUrl'
     RETURNING *, (xmax = 0) AS imported_created`,
    [id, inspected.name, inspected.description, JSON.stringify(skills), inspected.endpoint,
      String(userId), String(workspaceId), JSON.stringify(metadata)]
  );
  if (!rows[0]) {
    throw new N8NAdapterError('n8n import identity conflicts with an existing card.',
      'N8N_IMPORT_CONFLICT', 409);
  }
  const card = rows[0];
  const created = card.imported_created === true || card.imported_created === 'true';
  delete card.imported_created;
  return { card, created };
}

export const __test__ = { importedCardId, importMetadata };
