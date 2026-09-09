import pool from '../../db.js';
import {
  AgentCardInstallError,
  installAgentCard,
  listAgentCardInstalls,
  removeAgentCardInstall,
} from '../../agent-registry/installStore.js';

function scope(req) {
  const queryId = String(req.query?.workspaceId || '').trim();
  const bodyId = String(req.body?.workspaceId || '').trim();
  if (queryId && bodyId && queryId !== bodyId) {
    throw new AgentCardInstallError('Conflicting workspace IDs are not allowed.', 400,
      'AGENT_CARD_INSTALL_SCOPE_CONFLICT');
  }
  const workspaceId = queryId || bodyId;
  if (!workspaceId) throw new AgentCardInstallError('Open a workspace to manage AgentCards.', 400,
    'AGENT_CARD_INSTALL_SCOPE_REQUIRED');
  return { workspaceId, userId: Number(req.agentActor.id) };
}

function fail(res, error) {
  const status = Number(error?.statusCode);
  if (status >= 400 && status < 500) {
    return res.status(status).json({ error: error.message, code: error.code });
  }
  return res.status(500).json({ error: 'AgentCard installs are temporarily unavailable.' });
}

export async function listInstalls(req, res) {
  try {
    const auth = scope(req);
    const result = await listAgentCardInstalls(pool, auth);
    res.json({ workspaceId: auth.workspaceId, ...result });
  } catch (error) {
    fail(res, error);
  }
}

export async function installCard(req, res) {
  try {
    const result = await installAgentCard(pool, { ...scope(req), cardId: req.params.id });
    res.status(result.created ? 201 : 200).json(result);
  } catch (error) {
    fail(res, error);
  }
}

export async function removeInstall(req, res) {
  try {
    res.json(await removeAgentCardInstall(pool, { ...scope(req), cardId: req.params.id }));
  } catch (error) {
    fail(res, error);
  }
}
