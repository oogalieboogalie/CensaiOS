import pool from '../../db.js';
import { requireWorkspaceMember } from '../../workspaces/context.js';
import { fetchA2AImport, upsertA2AImport } from '../../agent-registry/adapters/a2aImport.js';
import { A2AAdapterError } from '../../agent-registry/adapters/a2aCard.js';
import {
  inspectN8NImport,
  N8NAdapterError,
  normalizeN8NImportInput,
  upsertN8NImport,
} from '../../agent-registry/adapters/n8nImport.js';

function input(req) {
  const workspaceId = String(req.body?.workspaceId || '').trim();
  const cardUrl = String(req.body?.cardUrl || '').trim();
  if (!workspaceId || !cardUrl) {
    throw new A2AAdapterError('workspaceId and cardUrl are required.', 'A2A_IMPORT_INPUT_REQUIRED', 400);
  }
  return { workspaceId, cardUrl };
}

function fail(res, error, fallback = 'External agent import is temporarily unavailable.') {
  const status = Number(error?.statusCode);
  if (status >= 400 && status < 600) {
    return res.status(status).json({ error: error.message, code: error.code });
  }
  return res.status(500).json({ error: fallback });
}

export async function importA2ACard(req, res) {
  try {
    const { workspaceId, cardUrl } = input(req);
    const userId = Number(req.agentActor?.id);
    await requireWorkspaceMember(pool, {
      userId, workspaceId, roles: ['owner', 'admin'],
    });
    const inspected = await fetchA2AImport(cardUrl);
    const result = await upsertA2AImport({ db: pool, workspaceId, userId, inspected });
    res.status(result.created ? 201 : 200).json({
      card: result.card,
      imported: true,
      executable: inspected.executable,
      protocolVersion: inspected.protocolVersion,
      reason: inspected.reason || null,
    });
  } catch (error) {
    fail(res, error, 'A2A import is temporarily unavailable.');
  }
}

export async function importN8NChat(req, res) {
  try {
    const workspaceId = String(req.body?.workspaceId || '').trim();
    if (!workspaceId) {
      throw new N8NAdapterError('workspaceId is required.', 'N8N_IMPORT_INPUT_REQUIRED', 400);
    }
    const normalized = normalizeN8NImportInput(req.body);
    const userId = Number(req.agentActor?.id);
    await requireWorkspaceMember(pool, {
      userId, workspaceId, roles: ['owner', 'admin'],
    });
    const inspected = await inspectN8NImport(normalized);
    const result = await upsertN8NImport({ db: pool, workspaceId, userId, inspected });
    res.status(result.created ? 201 : 200).json({
      card: result.card,
      imported: true,
      executable: true,
      protocolVersion: inspected.protocolVersion,
      endpointVerification: 'first_call',
    });
  } catch (error) {
    fail(res, error, 'n8n import is temporarily unavailable.');
  }
}
