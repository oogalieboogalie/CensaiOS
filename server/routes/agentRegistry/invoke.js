import { getAgentCard } from '../../agent-registry/factories.js';
import {
  actorId,
} from '../../agent-card-runs/contract.js';
import { createAgentCardRun, getAgentCardRun } from '../../agent-card-runs/store.js';
import { prepareAgentCardCall } from '../../agent-registry/callScope.js';

const CALL_CONTRACT_ERRORS = new Set([
  'unsupported-card-executor',
  'invalid-agent-card',
  'prompt-required',
  'prompt-too-large',
  'workspace-id-too-large',
  'invalid-task-id',
]);

function canReadRun(run, actor) {
  const id = actorId(actor);
  const metadata = run?.metadata || {};
  return Boolean(id) && (String(metadata.callerId) === id || String(metadata.ownerId || '') === id);
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value));
}

function publicRun(run) {
  const metadata = run.metadata || {};
  const failure = run.failure || null;
  return {
    taskId: run.id,
    runId: run.id,
    correlationId: metadata.clientTaskId,
    cardId: metadata.cardId,
    status: run.status,
    result: metadata.result ?? null,
    error: failure?.message || failure?.error || null,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
  };
}

export async function callCard(req, res) {
  try {
    const actor = req.agentActor;
    if (!actor) return res.status(401).json({ error: 'Authentication required' });
    const card = await getAgentCard(req.params.id);
    if (!card) return res.status(404).json({ error: 'Card not found' });
    const call = await prepareAgentCardCall({
      card,
      actor,
      payload: req.body?.payload,
      options: req.body?.options,
      workspaceId: req.body?.workspaceId,
    });
    const queued = await createAgentCardRun(call);
    res.status(202).json({
      taskId: queued.runId,
      runId: queued.runId,
      correlationId: queued.taskId,
      status: queued.status,
    });
  } catch (error) {
    const status = error.statusCode || (CALL_CONTRACT_ERRORS.has(error.code) ? 422 : 500);
    res.status(status).json({ error: error.message });
  }
}

export async function readCallResult(req, res) {
  try {
    const actor = req.agentActor;
    if (!actor) return res.status(401).json({ error: 'Authentication required' });
    if (!isUuid(req.params.taskId)) return res.status(404).json({ error: 'Task not found' });
    const run = await getAgentCardRun(req.params.taskId);
    if (!run || run.metadata?.cardId !== req.params.id || !canReadRun(run, actor)) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json(publicRun(run));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
